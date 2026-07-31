---
title: Restore
description: Undoing a soft-delete — what to call, and what comes back.
---

```
POST /workouts/cly8x7g9k0000abc123def456/restore
Authorization: Bearer <token>
```

Undoes a [soft-delete](/guides/endpoints/delete/). Answers with the record's own `data` shape, same as create and update, `deletedAt` back to `null`.

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

A record that was never deleted, or one you don't have `update` on, answers the same way any other capability check does — see [Errors and responses](/guides/errors-and-responses/).
