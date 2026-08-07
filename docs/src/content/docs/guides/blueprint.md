---
title: The blueprint contract
description: One YAML file declares everything a resource exposes — fields, permissions, and its whole search surface.
---

A blueprint is not just a list of fields — it is the full contract for what a resource exposes over HTTP, resolved once at generation time.

```yaml
name: BlogPost
fields:
  - name: title
    type: string
    optional: false
    hidden: false
permissions:
  view: own
  create: own
  update: own
  delete: own
pagination: # optional — leave it out and the search route returns every match
  limits: [10, 15, 20]
  default: 15
sorts: [createdAt, title]
filters: [title]
```

## Naming

`name` must be PascalCase (`ProductCategory`, not `product_category` or `productCategory`) and every field `name` must be camelCase (`scheduledAt`, not `scheduled_at`). Both are enforced by the same regex the schema loads and validates against — a blueprint that breaks either is rejected before generation runs, and `hery create:blueprint` rejects the resource name even earlier, at the command line.

This is the one casing convention in the project, and it is deliberately the only one: the resource name is PascalCase because it becomes a class name (`ProductCategoryController`, `ProductCategoryService`), a field name is camelCase because it becomes a TypeScript property and, with no `@map` anywhere in `schema.prisma`, the Postgres column name too — there is no separate snake_case layer at the database boundary to keep in sync with the one everything else already uses.

## Fields

Each field has a `type` (`string`, `int`, `boolean`, `datetime`), whether it's `optional`, and whether it's `hidden` — a hidden field is stripped from every API response by the generated `<name>.view.ts`, no matter which endpoint returns the record.

### Reserved fields

Seven names are the generator's to write, and a blueprint declaring one of them is rejected outright:

```
id  tenantId  ownerId  teamId  createdAt  updatedAt  deletedAt
```

The reason is narrow and worth stating: declaring one of these would put a **client-writable field on top of a column the framework decides**. A blueprint with an `ownerId` field would generate a DTO accepting it, which is how a caller ends up choosing its own owner — or its own team, or its own tenant. Refusing at load time is cheaper than discovering it in review.

`teamId` in particular is added *for* you, automatically, as soon as any permission preset is `team`.

## Permissions

One preset per action, each resolved through the same capabilities engine described in the capabilities guide.

`view` is the one worth pausing on: it drives the detail route *and* the `where` clause of the collection query, so both answer the same question from a single declaration. There is deliberately no separate `list` preset — two presets could diverge, and a record hidden from one route while handed out by the other is the exact bug this shape exists to make unwriteable. `view: all` with `update: own` gives the common case: everyone in the tenant reads, only the owner edits.

Choosing `team` anywhere changes the generated resource structurally: the Prisma model gains a `teamId` column and a relation, the create path stamps that column from the session and refuses with a 409 when the caller has no current team, and the view exposes it. See [Teams](/guides/teams/).

## Pagination, sorts and filters — the search contract

This is the part that goes beyond validating input: it bounds *output* too.

- `pagination` is optional, and it is the only place pagination is decided. Declare it and `limits` is the exhaustive list of page sizes a client may request — anything else is a 400 — while `default` is the size used when the caller names none. Leave the block out and the search route does not paginate: it returns every match, reports `"paginated": false` in `describe` and `meta`, and rejects a caller who sends `page` or `limit` rather than ignoring them. Bounding the result set is the developer's call, not the framework's.
- `sorts` is the allow-list of fields a client can sort by — `sort` in the body, prefixed with `-` for descending.
- `filters` is the allow-list of fields a client can filter on — one entry per field under `filters` in the body.

The generated controller enforces this through a single shared helper, `parseSearchRequest`, so every resource validates its search body the same way, and no resource can silently expose a field for filtering that was never meant to be queryable.

```
POST /blog-posts/search
{ "limit": 20, "sort": "-title", "filters": { "title": "foo" } }

POST /blog-posts/search
{ "limit": 999 }
→ 400 { "error": { "key": "query.invalid", "message": "Invalid value for \"limit\". Allowed: 10, 15, 20." } }
```

### The fields that need no declaration

Three more are understood by every collection route, and none of them appears in the blueprint because none of them names a field:

- `search.q` — free-text search across the resource's string fields. See [Full-text search](/guides/search/).
- `withTrashed` — include soft-deleted rows alongside live ones.
- `onlyTrashed` — the bin, and nothing else.

The two trashed parameters are not just filters: asking for either one is checked against `canListTrashed<Name>`, which follows the `delete` preset. Opening the bin is treated as a moderation action rather than a read, so a user who may see a record is not automatically allowed to browse deleted ones. The rows that come back are still narrowed by the view scope — the gate answers "may I look at the bin", the scope answers "which rows I may see in it".

## Relations

Three more keys describe what a resource is attached to, and they split by what a request may *do* with the relation rather than by how Prisma models it.

`includes` and `aggregates` are the read side — a relation a search request may embed, or count. Each entry names the relation, the resource on the other end, and how they are linked:

```yaml
includes:
  - relation: notes
    resource: BlogPostNote
    type: hasMany
    foreignKey: blogPostId
  - relation: comments
    resource: Comment
    type: morphMany
    foreignKey: commentableId
    discriminator: commentableType
    discriminatorValue: BlogPost
aggregates:
  - relation: notes
    resource: BlogPostNote
    type: hasMany
    foreignKey: blogPostId
```

`hasMany` is a real Prisma relation, so `foreignKey` is the column the related model points back with. `morphMany` has no Prisma-level relation at all — Prisma does not model polymorphic associations — so the related model's own discriminator column and the value it holds for *this* resource have to be declared; there is nothing to introspect. Both require `discriminator` and `discriminatorValue`, and a blueprint that omits either on a `morphMany` is rejected.

The referenced resource's own blueprint is what supplies the nested contract: the `filters`, `sorts` and `selects` a request may name *inside* an include come from there rather than being retyped on every parent that includes it. That is what `routed: false` is for — a resource generated with no controller, no service and no capabilities of its own, existing only to describe the shape of a relation once.

`relations` is the write side, and it is specifically the `belongsToMany` case `includes` cannot express: neither side owns the other, so attaching or detaching never touches the related row, only a row in the pivot table.

```yaml
relations:
  - relation: tags
    resource: Tag
    pivotTable: BlogPostTag
    foreignKey: blogPostId
    relatedKey: tagId
```

Each entry generates an `attach`/`detach`/`sync` block on the update route, gated by its own pair of capabilities (`canAttachTagsToBlogPost`, `canDetachTagsFromBlogPost`) — see [Update](/guides/endpoints/update/).

## Why YAML, not decorators

The blueprint is consumed once, at generation time — never read by the running application. Decorators like `@Capability` exist for behavior that genuinely needs to run per request; a static contract like pagination limits doesn't need that, and giving it decorator-based runtime metadata would just be indirection for something a YAML file already expresses clearly and diffs cleanly in review.
