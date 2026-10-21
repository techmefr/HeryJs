---
title: Bulk mutations
description: Create, update, delete and restore many records in one call, with a result per entry, a summary, and an all-or-nothing mode.
---

Every generated mutating route takes an array and answers one result per entry, in the same order, so one record and a hundred share one shape. The array is capped at 100 entries (`MAX_BATCH_ENTRIES`); a resource that needs more raises it in its own DTO.

```http
POST /blog-posts/update
Content-Type: application/json

{ "data": [{ "id": "a", "title": "One" }, { "id": "b", "title": "Two" }] }
```

```json
{
  "data": [
    {
      "index": 0,
      "id": "a",
      "status": "ok",
      "data": { "id": "a", "title": "One" }
    },
    {
      "index": 1,
      "id": "b",
      "status": "error",
      "error": { "status": 404, "key": "blog-post.notFound" }
    }
  ],
  "meta": { "total": 2, "succeeded": 1, "failed": 1 },
  "messages": []
}
```

## Partial failure is the default

Each entry is authorised on its own record, loaded on its own, and written on its own. A record that is missing, a record the caller may not touch and a write that throws become that entry's `error`, shaped like every other error in the API, and the other entries are unaffected. The HTTP status stays `201` whatever happened to the entries, so a client reads `meta` (or walks `data`) to find out. `meta` counts the entries: `total`, `succeeded`, `failed`.

## All or nothing

Send `atomic: true` on any of create, update, delete and restore:

```json
{
  "atomic": true,
  "data": [
    { "id": "a", "title": "One" },
    { "id": "b", "title": "Two" }
  ]
}
```

- every entry is loaded and authorised first. If any entry is missing or denied, nothing is written.
- otherwise the writes run in one database transaction, in order. The first one that fails rolls the whole batch back, and the audit entries written along the way roll back with it.
- on success the response is the same as a non-atomic one, with `succeeded` equal to `total`.
- on failure the response is a `422` with the key `batch.atomicFailed`. `error.details.results` lists every entry: the ones that could not be applied carry their `error`, every other entry is `notApplied`, and `error.details.summary` counts them.

```json
{
  "error": {
    "status": 422,
    "key": "batch.atomicFailed",
    "message": "The batch was atomic and 1 entry failed, so nothing was written. Every entry is listed in details.results.",
    "details": {
      "results": [
        { "index": 0, "id": "a", "status": "notApplied" },
        {
          "index": 1,
          "id": "b",
          "status": "error",
          "error": { "status": 404, "key": "blog-post.notFound" }
        }
      ],
      "summary": { "total": 2, "succeeded": 0, "failed": 1 }
    }
  }
}
```

The default is `atomic: false`, so nothing changes for a caller that does not ask. Combine it with [optimistic concurrency](../guides/optimistic-concurrency/) and a stale `version` on any entry is exactly such a failure: nothing in the batch is saved.

## Side effects wait for the commit

A write inside an atomic batch does not announce itself until the transaction has committed. The realtime signal and the search-index update a generated service performs are queued and run after commit, so a rolled-back batch leaves nothing behind in the index and tells no client anything changed. A failure of one of those after-commit steps is logged and does not fail a batch that already committed.

## For your own services

A service that writes through the injected Prisma client joins the transaction without knowing it exists: while a batch is atomic, the tenant-scoped client routes every operation (and the audit write that follows it) through the open transaction. To run your own all-or-nothing block, wrap it in `prisma.$atomic(async () => { ... })`; nested calls join the outer transaction. `AmbientTransactionStorage.afterCommit(callback)` queues a side effect to run once it commits, or runs it straight away outside one.
