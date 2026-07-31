---
title: Update
description: What a partial update accepts, what comes back, and what a caller without permission gets instead.
---

```
PATCH /workouts/cly8x7g9k0000abc123def456
Authorization: Bearer <token>
Content-Type: application/json

{ "title": "Leg day (heavy)" }
```

Partial payload — only the fields you send change. A caller without `update` on this record gets a real `403 capability.forbidden`, not a silently ignored write.

```json
{
  "data": {
    "id": "cly8x7g9k0000abc123def456",
    "tenantId": "acme",
    "ownerId": "user_9f8e7d6c",
    "title": "Leg day (heavy)",
    "createdAt": "2026-07-31T09:12:03.000Z",
    "updatedAt": "2026-07-31T09:20:11.000Z",
    "deletedAt": null
  },
  "messages": []
}
```

## When the payload is rejected

```json
{ "error": { "status": 422, "key": "validation.failed", "message": "Validation failed.", "details": { "title": ["Too short"] } } }
```

Same shape as [Create](/guides/endpoints/create/) — `details` mirrors the field names from the resource's own validation rules, see [Details](/guides/endpoints/details/) for the JSON Schema those rules come from.
