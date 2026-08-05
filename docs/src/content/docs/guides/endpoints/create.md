---
title: Create
description: What to send to create a record, what comes back, and how a rejected payload is reported.
---

```
POST /workouts/create
Authorization: Bearer <token>
Content-Type: application/json

{ "data": [{ "title": "Leg day" }] }
```

`data` is always an array, even for a single record — the response shape never has to differ between creating one record and creating a hundred. Only the fields the blueprint declares go in each entry. `id`, `tenantId`, `ownerId` and the timestamps are never accepted from the client — they are the server's to decide, and sending them has no effect. See [Details](/guides/endpoints/details/) for exactly which fields are required, straight from the resource's own contract.

```json
{
  "data": [
    {
      "index": 0,
      "status": "ok",
      "data": {
        "id": "cly8x7g9k0000abc123def456",
        "tenantId": "acme",
        "ownerId": "user_9f8e7d6c",
        "title": "Leg day",
        "createdAt": "2026-07-31T09:12:03.000Z",
        "updatedAt": "2026-07-31T09:12:03.000Z",
        "deletedAt": null
      }
    }
  ],
  "messages": []
}
```

Each entry in the response reports its own `status` — one entry failing validation never blocks the others in the same request. A failed entry carries `error` instead of `data`.

## When the payload is rejected

```json
{ "error": { "status": 422, "key": "validation.failed", "message": "Validation failed.", "details": { "title": ["Required"] } } }
```

`details` mirrors the field names from the resource's own validation rules — see [Details](/guides/endpoints/details/) for the JSON Schema those rules come from, so a form can validate before submitting instead of round-tripping to find out.
