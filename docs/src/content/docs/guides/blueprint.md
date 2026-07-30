---
title: The blueprint contract
description: One YAML file declares everything a resource exposes — fields, permissions, and its whole search surface.
---

A blueprint is not just a list of fields — it is the full contract for what a resource exposes over HTTP, resolved once at generation time.

```yaml
name: Workout
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

## Fields

Each field has a `type` (`string`, `int`, `boolean`, `datetime`), whether it's `optional`, and whether it's `hidden` — a hidden field is stripped from every API response by the generated `<name>.view.ts`, no matter which endpoint returns the record.

## Permissions

One preset per action, each resolved through the same capabilities engine described in the capabilities guide.

`view` is the one worth pausing on: it drives the detail route *and* the `where` clause of the collection query, so both answer the same question from a single declaration. There is deliberately no separate `list` preset — two presets could diverge, and a record hidden from one route while handed out by the other is the exact bug this shape exists to make unwriteable. `view: all` with `update: own` gives the common case: everyone in the tenant reads, only the owner edits.

## Pagination, sorts and filters — the search contract

This is the part that goes beyond validating input: it bounds *output* too.

- `pagination.limits` is the exhaustive list of page sizes a client is allowed to request; anything else is rejected with a 400.
- `sorts` is the allow-list of fields a client can sort by — via `?sort=field` or `?sort=-field` for descending.
- `filters` is the allow-list of fields a client can filter on — via `?filter[field]=value`.

The generated controller enforces this through a single shared helper, `parseListQuery`, so every resource validates its query the same way, and no resource can silently expose a field for filtering that was never meant to be queryable.

```
GET /workouts?limit=20&sort=-title&filter[title]=foo
GET /workouts?limit=999
→ 400 { "error": { "key": "query.invalid", "message": "Invalid value for \"limit\". Allowed: 10, 15, 20." } }
```

## Why YAML, not decorators

The blueprint is consumed once, at generation time — never read by the running application. Decorators like `@Capability` exist for behavior that genuinely needs to run per request; a static contract like pagination limits doesn't need that, and giving it decorator-based runtime metadata would just be indirection for something a YAML file already expresses clearly and diffs cleanly in review.
