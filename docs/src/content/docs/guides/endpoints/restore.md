---
title: Restore
description: Undoing a soft-delete — what to call, and what comes back.
---

```
POST /blog-posts/restore
Authorization: Bearer <token>
Content-Type: application/json

{ "ids": ["cly8x7g9k0000abc123def456"] }
```

`ids` is always an array, even for a single record. Undoes a [soft-delete](/guides/endpoints/delete/) — `deletedAt` goes back to `null`.

```json
{
  "data": [
    {
      "index": 0,
      "id": "cly8x7g9k0000abc123def456",
      "status": "ok",
      "data": {
        "id": "cly8x7g9k0000abc123def456",
        "title": "Hello world",
        "deletedAt": null
      }
    }
  ],
  "messages": []
}
```

A record that was never deleted, or one you don't have `delete` on, answers `error` for that entry the same way any other capability check does — see [Errors and responses](/guides/errors-and-responses/). One record failing never blocks the others in the same request.

An optional `patch` reapplies a short, scoped update in the same call, reusing the resource's own update field whitelist rather than a second round trip:

```json
{ "ids": ["cly8x7g9k0000abc123def456"], "patch": { "title": "Hello world (restored)" } }
```
