---
title: Errors and responses
description: Domain exceptions, the global filter, and the response envelope every endpoint shares.
---

## Domain exceptions

Every error case throws an instance of `DomainException` (or a subclass) instead of returning an error code by hand:

```ts
export class RecordNotFoundException extends DomainException {
  constructor(resource: string) {
    super(HttpStatus.NOT_FOUND, `${resource}.notFound`, `${resource} not found.`);
  }
}
```

`CapabilityForbiddenException`, `InvalidCredentialsException`, `InvalidSessionException`, `InvalidQueryException` and `RecordNotFoundException` all follow this shape: an HTTP status, a stable machine-readable `key`, a human-readable message, and optional `details`.

## The global filter

A single Nest exception filter, `DomainExceptionFilter`, is wired once via `APP_FILTER` and turns any `DomainException` into the same JSON shape:

```json
{ "error": { "status": 403, "key": "capability.forbidden", "message": "...", "details": {} } }
```

No controller formats its own error response. If a new error case needs a new shape, it's a new `DomainException` subclass, not a one-off `res.status(...).json(...)`.

## The success envelope

Successful responses share the same shape on the way out:

```ts
export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return meta ? { data, meta, messages: [] } : { data, messages: [] };
}
```

Every generated controller method returns `ok(...)`. The `messages` array exists for future user-facing notifications (a save that succeeded but triggered a background job, for instance) without changing the response shape when that need shows up.
