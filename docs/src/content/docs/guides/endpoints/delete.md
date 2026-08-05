---
title: Delete
description: Soft-deleting a record — what changes, what a client sees afterwards, and nothing is ever gone from the database.
---

```
POST /workouts/delete
Authorization: Bearer <token>
Content-Type: application/json

{ "ids": ["cly8x7g9k0000abc123def456"] }
```

`ids` is always an array, even for a single record. By default this is a soft-delete: the record stops appearing in normal listings and searches (it simply is not in the results, the same as one that does not exist), but nothing is actually gone from the database. Listing it again requires `withTrashed` or `onlyTrashed` — see [Search](/guides/endpoints/search/) — which is itself gated behind the delete permission, not the read one.

```json
{
  "data": [
    {
      "index": 0,
      "id": "cly8x7g9k0000abc123def456",
      "status": "ok",
      "data": {
        "id": "cly8x7g9k0000abc123def456",
        "title": "Leg day",
        "deletedAt": "2026-07-31T09:20:11.000Z"
      }
    }
  ],
  "messages": []
}
```

Each entry reports its own `status` — one record you don't have `delete` on never blocks the others in the same request; that entry carries `error` instead of `data`.

To undo this, see [Restore](/guides/endpoints/restore/).

## Hard delete

```
POST /workouts/delete
Authorization: Bearer <token>
Content-Type: application/json

{ "ids": ["cly8x7g9k0000abc123def456"], "mode": "hard" }
```

Removes the row for good, not a soft flag — nothing to restore afterwards. Gated by its own admin-only capability, checked in addition to (never instead of) the delete permission above. A caller without it gets the usual `403 capability.forbidden`, and no record is touched. On success, `data` is `null` for that entry: there is no row left to describe.
