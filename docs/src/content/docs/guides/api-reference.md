---
title: API reference for frontend developers
description: What every generated endpoint looks like from outside the process — the request shape, the response shape, and what changes when something goes wrong.
---

Every resource `hery generate` produces exposes the same six routes, shaped by the same envelope. Once you have read one resource's endpoints, you have effectively read all of them — the only things that change from one resource to the next are the URL segment and the fields inside `data`.

This page walks through a real one, `Workout`, end to end: what to send, and exactly what comes back.

## The six routes

| Method | Path | What it does |
|---|---|---|
| `GET` | `/workouts` | List, with search, sort, filter and pagination |
| `GET` | `/workouts/:id` | Read one record |
| `POST` | `/workouts` | Create |
| `PATCH` | `/workouts/:id` | Update |
| `DELETE` | `/workouts/:id` | Soft-delete |
| `POST` | `/workouts/:id/restore` | Undo a soft-delete |

Every one of them requires a session — send the bearer token you got from `/auth/login` or `/auth/register` in an `Authorization: Bearer <token>` header. See [Authentication](/guides/authentication/) for how to get one.

## Creating a record

```
POST /workouts
Authorization: Bearer <token>
Content-Type: application/json

{ "title": "Leg day" }
```

Only the fields the blueprint declares go in the body. `id`, `tenantId`, `ownerId` and the timestamps are never accepted from the client — they are the server's to decide, and sending them has no effect.

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

Three keys, always: `data`, `meta` (only when there is something to say about the response, see below), `messages` (a list of strings for a human — often empty, always present, safe to render unconditionally). This is the whole envelope; there is no fourth shape hiding somewhere else. See [Errors and responses](/guides/errors-and-responses/) for the full contract, including the error side.

## Reading one record

```
GET /workouts/cly8x7g9k0000abc123def456
Authorization: Bearer <token>
```

Same `data` shape back. A record you are not allowed to see — someone else's, in a `view: own` resource — answers exactly like a record that does not exist:

```json
{ "error": { "status": 404, "key": "workout.notFound", "message": "Workout not found.", "details": {} } }
```

That is deliberate: a 403 here would confirm the record exists, which is itself information a caller without access should not get.

## Listing, searching, sorting, filtering

```
GET /workouts?limit=15&sort=-createdAt&filter[title]=leg&q=press
```

| Param | What it does |
|---|---|
| `limit` | Page size — must be one of the values the blueprint's `pagination.limits` declares |
| `sort` | A field from the blueprint's `sorts` list; prefix with `-` for descending |
| `filter[field]` | Exact-match filter, one entry per allow-listed field |
| `q` | Free-text search across the resource's string fields — see [Full-text search](/guides/search/) |
| `search[engine]` | Picks a named search engine when more than one is configured, instead of the default |
| `withTrashed` / `onlyTrashed` | Include or show only soft-deleted rows — gated behind the delete permission, not the read one |

Ask for something outside the allow-list and you get a 400, not a silently ignored parameter:

```
GET /workouts?limit=999
```
```json
{ "error": { "status": 400, "key": "query.invalid", "message": "Invalid value for \"limit\". Allowed: 10, 15, 20.", "details": {} } }
```

```json
{
  "data": [
    { "id": "cly8x7g9k0000abc123def456", "tenantId": "acme", "ownerId": "user_9f8e7d6c", "title": "Leg day", "createdAt": "2026-07-31T09:12:03.000Z", "updatedAt": "2026-07-31T09:12:03.000Z", "deletedAt": null }
  ],
  "meta": { "channels": ["acme:workout"] },
  "messages": []
}
```

`meta.channels` is what a live UI subscribes to — see [Realtime](/guides/realtime/) — to know when to refetch, instead of polling.

## Knowing what you're allowed to do before you try it

Add `?include=capabilities` to a list or a detail request and each record grows a `capabilities` object describing what the current caller may do with it — no need to attempt an update just to find out it will fail:

```
GET /workouts/cly8x7g9k0000abc123def456?include=capabilities
```

```json
{
  "data": {
    "id": "cly8x7g9k0000abc123def456",
    "title": "Leg day",
    "capabilities": { "view": true, "update": true, "delete": true }
  },
  "messages": []
}
```

Use this to decide whether to render an edit button, not as a substitute for handling the 403 the server still returns if you ignore it — the server re-checks every write regardless of what this said a moment ago.

## Updating and deleting

```
PATCH /workouts/cly8x7g9k0000abc123def456
{ "title": "Leg day (heavy)" }
```

Partial payload — only the fields you send change. A caller without `update` on this record gets a real `403 capability.forbidden`, not a silently ignored write.

```
DELETE /workouts/cly8x7g9k0000abc123def456
```

Soft-delete: the record stops appearing in normal listings and detail reads (a 404, same as one you never had access to), but nothing is actually gone from the database.

```
POST /workouts/cly8x7g9k0000abc123def456/restore
```

Undoes it. Both routes answer with the record's own `data` shape, same as create and update.

## When something goes wrong

Every error, from every route, comes back the same way — see [Errors and responses](/guides/errors-and-responses/) for the full table of status/key pairs. The one rule worth keeping in mind while building a UI: **the `key` is what you branch on in code, the `message` is what you show a human, and neither ever changes shape** between resources or between routes.

If a response looks wrong and you can't tell why — a 403 you didn't expect, a filter that silently returns nothing — see [Debugging with the pipeline trace](/guides/debugging/), which is aimed at whoever owns the backend for exactly this conversation.
