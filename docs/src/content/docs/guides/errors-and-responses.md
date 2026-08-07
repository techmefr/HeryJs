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

Every subclass follows that shape: an HTTP status, a stable machine-readable `key`, a human-readable message, and optional `details`.

| Exception | Status | Key |
|---|---|---|
| `MissingSessionException` | 401 | `auth.session.missing` |
| `InvalidSessionException` | 401 | `auth.session.invalid` |
| `InvalidCredentialsException` | 401 | `auth.invalidCredentials` |
| `CapabilityForbiddenException` | 403 | `capability.forbidden` |
| `ApiKeyEscalationException` | 403 | `apiKey.forbidden` |
| `RecordNotFoundException` | 404 | `<resource>.notFound` |
| `NoCurrentTeamException` | 409 | `team.noCurrentTeam` |
| `InvalidQueryException` | 400 | `query.invalid` |

The two 401s are split on purpose. "You sent no token" and "you sent a token that is not valid" are different problems with different client fixes — one means sign in, the other means your session expired — and collapsing them into one key forces the client to guess.

`NoCurrentTeamException` is the clearest illustration of why the status matters as much as the key. Creating a team-owned record with no current team is not *forbidden*: nothing about the request is wrong, and retrying it unchanged will succeed once the caller joins a team. That is a 409, not a 403, and the distinction is what lets a client tell "you may not do this" apart from "do this first".

## The global filter

A single Nest exception filter, `DomainExceptionFilter`, is wired once via `APP_FILTER` and turns any `DomainException` into the same JSON shape:

```json
{ "error": { "status": 403, "key": "capability.forbidden", "message": "..." } }
```

No controller formats its own error response. If a new error case needs a new shape, it's a new `DomainException` subclass, not a one-off `res.status(...).json(...)`.

The filter catches **everything**, not just domain exceptions. A plain Nest `HttpException` is reported with the key `http.error`, and anything else at all becomes a 500 with the key `internal.error` and the message `Internal server error.` — never the original message, so an unexpected throw cannot leak a stack trace, a query or a connection string to a caller.

Withholding it from the caller is not the same as throwing it away, though, and it used to be both: the stack went nowhere, so a production 500 left nothing to read. An unrecognised exception is now written down under a generated id, and the response carries that id:

```json
{
  "error": {
    "status": 500,
    "key": "internal.error",
    "message": "Internal server error.",
    "details": { "errorId": "0f8c…" }
  }
}
```

The same id prefixes the logged line — `logger.error` with the full stack, which the terminal, `docker compose logs` and any collector already pick up — and a step is pushed onto the request trace, so the failing request shows up on the pipeline page in development. The HTML error page prints it as a reference. A caller quoting an id can therefore be answered from the logs, without the response ever having to explain itself.

One more branch: a request whose `Accept` header asks for HTML gets an HTML error page instead of JSON. Hitting a wrong URL in a browser produces something readable rather than a wall of JSON, without a client that asked for JSON ever receiving markup.

## The success envelope

Successful responses share the same shape on the way out, and `ok()` is overloaded so the common cases stay short:

```ts
ok(record)                                  // { data, messages: [] }
ok(record, ['Team created.'])               // { data, messages }
ok(records, { channels: ['blogPost'] })     // { data, meta, messages: [] }
ok(records, { currentTeamId }, ['Saved.'])  // all three
```

Every generated controller method returns `ok(...)`. Three keys, always the same three, so a client can be written once against the envelope rather than per endpoint.

`meta` carries what is *about* the response rather than in it — the channels to subscribe to for invalidation, the collection-level capabilities a search request asked for in its `capabilities` array, the page window on a paged route, the caller's current team on `GET /teams`.

`messages` carries text meant for a human. This is what lets a backend that has just done something non-obvious say so — a save that also queued a job, a create that also joined you to a team — without inventing a response shape for the occasion. Because the field is always present, a client can render it unconditionally and never has to ask whether this particular endpoint might have something to say.

