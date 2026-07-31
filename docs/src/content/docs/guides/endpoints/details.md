---
title: Details
description: Read one record, and fetch a resource's full contract — fields, limits, sorts, filters and validation rules — without hardcoding its shape by hand.
---

## Reading one record

```
GET /workouts/cly8x7g9k0000abc123def456
Authorization: Bearer <token>
```

```json
{
  "data": {
    "id": "cly8x7g9k0000abc123def456",
    "tenantId": "acme",
    "ownerId": "user_9f8e7d6c",
    "title": "Leg day",
    "createdAt": "2026-07-31T09:12:03.000Z",
    "updatedAt": "2026-07-31T09:12:03.000Z",
    "deletedAt": null
  },
  "messages": []
}
```

A record you are not allowed to see — someone else's, in a `view: own` resource — answers exactly like a record that does not exist:

```json
{
  "error": {
    "status": 404,
    "key": "workout.notFound",
    "message": "Workout not found.",
    "details": {}
  }
}
```

That is deliberate: a 403 here would confirm the record exists, which is itself information a caller without access should not get.

## The resource's contract

```
GET /workouts/describe
Authorization: Bearer <token>
```

Every generated resource exposes its own shape at this route: the fields it has, the values `sort` and `limit` will actually accept, and the validation rules `create` and `update` enforce — as JSON Schema, reflected straight off the same Zod schemas the server validates against, not a hand-maintained copy of them.

```json
{
  "data": {
    "fields": [{ "name": "title", "type": "string", "optional": false }],
    "sorts": ["createdAt"],
    "filters": [],
    "limits": [10, 15, 20],
    "defaultLimit": 15,
    "rules": {
      "create": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "title": { "type": "string", "minLength": 1, "maxLength": 255 }
        },
        "required": ["title"],
        "additionalProperties": false
      },
      "update": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "title": { "type": "string", "minLength": 1, "maxLength": 255 }
        },
        "additionalProperties": false
      }
    }
  },
  "messages": []
}
```

Use this to build a form that only shows the fields the resource actually has, marks the ones `create.required` lists as mandatory, and validates lengths client-side before ever hitting the server — the server still re-validates on write, this is for UX, not for security.

There is no `relations` key: the blueprint has no concept of relations between resources yet, so this endpoint reports what actually exists rather than an always-empty placeholder for a feature that isn't there.

Same guard as every other route on the resource — a caller without permission to view the resource gets the usual 403, not the contract.
