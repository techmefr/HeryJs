---
title: Delete and restore
description: Soft-deleting a record and undoing it — what changes, what a client sees in the meantime, and nothing is ever gone from the database.
---

## Deleting a record

```
DELETE /workouts/cly8x7g9k0000abc123def456
Authorization: Bearer <token>
```

Soft-delete: the record stops appearing in normal listings and detail reads (a 404, same as one you never had access to), but nothing is actually gone from the database. Listing it again requires `withTrashed` or `onlyTrashed` — see [Search](/guides/endpoints/search/) — which is itself gated behind the delete permission, not the read one.

```json
{
  "data": {
    "id": "cly8x7g9k0000abc123def456",
    "title": "Leg day",
    "deletedAt": "2026-07-31T09:20:11.000Z"
  },
  "messages": []
}
```

## Restoring it

```
POST /workouts/cly8x7g9k0000abc123def456/restore
Authorization: Bearer <token>
```

Undoes it. Answers with the record's own `data` shape, same as create and update, `deletedAt` back to `null`.

```json
{
  "data": {
    "id": "cly8x7g9k0000abc123def456",
    "title": "Leg day",
    "deletedAt": null
  },
  "messages": []
}
```
