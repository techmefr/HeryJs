---
title: Update
description: What a partial update accepts, what comes back, and what a caller without permission gets instead.
---

```
POST /blog-posts/update
Authorization: Bearer <token>
Content-Type: application/json

{
  "data": [
    { "id": "cly8x7g9k0000abc123def456", "title": "Hello world (v2)" }
  ]
}
```

`data` is always an array, even for a single record — the response shape never has to differ between updating one record and updating a hundred. Only the fields you send change; a caller without `update` on a given record gets a real `403 capability.forbidden` for that entry, not a silently ignored write.

```json
{
  "data": [
    {
      "index": 0,
      "id": "cly8x7g9k0000abc123def456",
      "status": "ok",
      "data": {
        "id": "cly8x7g9k0000abc123def456",
        "tenantId": "acme",
        "ownerId": "user_9f8e7d6c",
        "title": "Hello world (v2)",
        "createdAt": "2026-07-31T09:12:03.000Z",
        "updatedAt": "2026-07-31T09:20:11.000Z",
        "deletedAt": null
      }
    }
  ],
  "messages": []
}
```

Each entry in the response reports its own `status` — one record failing (a 403, a validation error) never blocks the others in the same request. An entry that fails carries `error` instead of `data`, with the same `{ status, key, message }` shape as any other error response.

## When the payload is rejected

```json
{ "error": { "status": 422, "key": "validation.failed", "message": "Validation failed.", "details": { "title": ["Too short"] } } }
```

Same shape as [Create](/guides/endpoints/create/) — `details` mirrors the field names from the resource's own validation rules, see [Details](/guides/endpoints/details/) for the JSON Schema those rules come from.

## Relations: attach, detach, sync

A resource whose blueprint declares a `relations` entry (a belongsToMany relation through a pivot table) accepts an extra `relations` key per entry, alongside its own fields:

```
POST /blog-posts/update
Authorization: Bearer <token>
Content-Type: application/json

{
  "data": [
    {
      "id": "cly8x7g9k0000abc123def456",
      "relations": { "tags": { "attach": ["tag_1", "tag_2"] } }
    }
  ]
}
```

`attach` adds to the pivot, `detach` removes from it, `sync` replaces the whole set in one call. `sync` is never combined with `attach`/`detach` in the same request — "replace with exactly this set" and "add/remove from whatever is there" are different intents that would otherwise race on the same pivot row.

Attaching or syncing requires the resource's `attach:{relation}` capability, detaching (including the detach half of a `sync`) requires `detach:{relation}` — both checked on the record being updated, distinct from the plain `update` capability. Being able to edit a record's own fields does not automatically mean being able to attach or detach whatever it is linked to.

The response echoes the relation's resolved state — the full list of related ids after the mutation, not just the ones you sent:

```json
{
  "data": [
    {
      "index": 0,
      "id": "cly8x7g9k0000abc123def456",
      "status": "ok",
      "data": {
        "id": "cly8x7g9k0000abc123def456",
        "title": "Hello world (v2)",
        "tags": ["tag_1", "tag_2"]
      }
    }
  ],
  "messages": []
}
```
