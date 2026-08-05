---
title: Details
description: Read one record, and fetch a resource's full contract — fields, limits, sorts, filters and validation rules — without hardcoding its shape by hand.
---

## Reading one record

There is no dedicated single-record route — a resource is read the same way it is listed, through [Search](/guides/endpoints/search/), filtered down to one id:

```
POST /workouts/search
Authorization: Bearer <token>
Content-Type: application/json

{ "filters": [{ "field": "id", "value": "cly8x7g9k0000abc123def456" }] }
```

```json
{
  "data": [
    {
      "id": "cly8x7g9k0000abc123def456",
      "tenantId": "acme",
      "ownerId": "user_9f8e7d6c",
      "title": "Leg day",
      "createdAt": "2026-07-31T09:12:03.000Z",
      "updatedAt": "2026-07-31T09:12:03.000Z",
      "deletedAt": null
    }
  ],
  "meta": { "channels": ["workout"], "page": 1, "limit": 15, "total": 1, "last_page": 1 },
  "messages": []
}
```

A record that does not exist, is soft-deleted, belongs to another tenant, or that the `view` preset says you may not see — someone else's in a `view: own` resource — comes back the same way: an empty `data` array. There is no 404 or 403 to tell those cases apart, on purpose: the scope clause that excludes rows you cannot see and the `where` clause that excludes rows that do not exist are the same kind of filter, applied before the query ever runs, not a lookup that then checks a permission.

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

There is no `relations` key: this endpoint reports what the resource's own fields and validation rules are, not the shape of `includes`/`aggregates`/`relations` a search or update request may reference — see [Search](/guides/endpoints/search/) and [Update](/guides/endpoints/update/) for those.

Same guard as every other route on the resource — a caller without permission to view the resource gets the usual 403, not the contract.
