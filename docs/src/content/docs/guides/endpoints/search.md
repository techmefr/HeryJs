---
title: Search
description: List a resource with pagination, sorting, filtering and full-text search — the query parameters, the allow-lists behind them, and what the response looks like.
---

```
POST /workouts/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "limit": 15,
  "sort": "-createdAt",
  "filters": { "title": "leg" },
  "search": { "q": "press" }
}
```

| Body field                    | What it does                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `limit`                        | Page size — must be one of the values the blueprint's `pagination.limits` declares             |
| `sort`                         | A field from the blueprint's `sorts` list; prefix with `-` for descending                      |
| `filters.<field>`              | Exact-match filter, one entry per allow-listed field                                           |
| `search.q`                     | Free-text search across the resource's string fields — see [Full-text search](/guides/search/) |
| `search.engine`                | Picks a named search engine when more than one is configured, instead of the default           |
| `withTrashed` / `onlyTrashed`  | Include or show only soft-deleted rows — gated behind the delete permission, not the read one  |

Every one of these is an allow-list, not a passthrough. Ask for something outside it and you get a 400, not a silently ignored field:

```
POST /workouts/search
{ "limit": 999 }
```

```json
{
  "error": {
    "status": 400,
    "key": "query.invalid",
    "message": "Invalid value for \"limit\". Allowed: 10, 15, 20.",
    "details": {}
  }
}
```

To know a resource's actual allow-lists ahead of time instead of guessing from a 400, see the [Details](/guides/endpoints/details/) page.

## Response shape

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
  "meta": { "channels": ["acme:workout"] },
  "messages": []
}
```

`meta.channels` is what a live UI subscribes to — see [Realtime](/guides/realtime/) — to know when to refetch, instead of polling.

## Knowing what you're allowed to do before you try it

Add `?include=capabilities` and each record grows a `capabilities` object describing what the current caller may do with it — no need to attempt an update just to find out it will fail. This stays a query parameter even though the search itself moved to the body, since it shapes the response rather than the query:

```
POST /workouts/search?include=capabilities
{}
```

```json
{
  "data": [
    {
      "id": "cly8x7g9k0000abc123def456",
      "title": "Leg day",
      "capabilities": { "view": true, "update": true, "delete": true }
    }
  ],
  "messages": []
}
```

Use this to decide whether to render an edit button, not as a substitute for handling the 403 the server still returns if you ignore it — the server re-checks every write regardless of what this said a moment ago.
