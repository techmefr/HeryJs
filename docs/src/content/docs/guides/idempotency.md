---
title: Idempotency keys
description: A client retrying a POST it never saw the answer to gets the original response back instead of a second record.
---

A retried `POST` is the most ordinary failure on the internet, and without help every create route creates the record twice. Send an `Idempotency-Key` header on a mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) and the framework makes the retry safe, on every route, with nothing to wire up.

```http
POST /teams
Idempotency-Key: 7b0f2a64-3c1e-4d57-9a1b-0e6f5d2c8a11
Content-Type: application/json

{ "name": "Acme" }
```

A request without the header runs normally.

## What happens

- **First request:** the handler runs, and the key, tenant, route, a hash of the body and the response are stored.
- **Same key, same request:** the stored response is returned with its original status code and headers, and the handler does not run.
- **Same key, different body or route:** `422` with the error key `idempotency.mismatch`. Reusing a key for two different requests is a client bug, and replaying the first answer would hide it.
- **Same key while the first is still running:** the retry waits for it and gets the same response. If the first has not finished after ten seconds, it gets `409` with `idempotency.lock-timeout`.
- **Handler failed:** nothing is stored, so a retry runs the handler again.

Keys are scoped per tenant, so two tenants can use the same key without meeting. A key longer than 255 characters is ignored.

## Why concurrent retries do not both run

The `IdempotencyKey` record is written before the handler, while holding the [distributed lock](../lock/) named after the tenant and key. Two retries that arrive together cannot both miss the cache: one takes the lock and runs, the other waits and replays. A unique constraint on `(tenantId, key)` backs the lock up.

## Expiry

A key lives 24 hours. A record older than that is never replayed, even if it has not been swept yet. Rows are removed by the [prune](../prune/) sweep: they carry `deletedAt` from creation, and `hery.config.ts` sets their retention to one day.

```ts
prune: {
  overrides: {
    IdempotencyKey: { retentionDays: 1 },
  },
},
```

## Limits

Only JSON responses are stored. A route that streams a file should not be called with a key.
