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
pagination:
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

- `pagination.limits` is the exhaustive list of page sizes a client is allowed to request; anything else is rejected with a 400.
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

## Why YAML, not decorators

The blueprint is consumed once, at generation time — never read by the running application. Decorators like `@Capability` exist for behavior that genuinely needs to run per request; a static contract like pagination limits doesn't need that, and giving it decorator-based runtime metadata would just be indirection for something a YAML file already expresses clearly and diffs cleanly in review.
