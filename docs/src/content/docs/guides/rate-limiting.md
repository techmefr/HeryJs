---
title: Rate limiting
description: A rate limit on by default across every kernel and module route, with buckets a project can retune but never remove.
---

Every kernel and module route is rate limited from the start, guarding against brute-force logins, credential stuffing, and scraping without any wiring per resource. A project can retune the limits; it cannot silently end up with none, because the fallback lives in code, not in a config block that can be left out.

## Buckets

Three buckets cover the surface: `read`, `write`, and `auth`. Each route declares which one applies:

```ts
@Get()
@RateLimit('read')
list() {
  // ...
}

@Post()
@RateLimit('write')
create() {
  // ...
}
```

Auth endpoints — login, registration, token issuance — use the tighter `auth` bucket:

```ts
@Post('login')
@RateLimit('auth')
login() {
  // ...
}
```

The defaults, applied when `hery.config.ts` does not override a bucket:

| Bucket  | Limit | Window |
| ------- | ----- | ------ |
| `read`  | 120   | 60s    |
| `write` | 30    | 60s    |
| `auth`  | 5     | 300s   |

Override any of them in `hery.config.ts`:

```ts
export default {
  rateLimit: {
    buckets: {
      write: { limit: 60, windowSeconds: 60 },
    },
  },
} satisfies HeryConfig;
```

An omitted bucket keeps its hardcoded default — a config block left out never turns the guard off, only `cache`'s idiom lets an absent block mean "disabled."

## Opting a route out

A route that cannot sensibly share a budget with the rest of the surface — one authenticated by something other than a request quota — declares why instead of a bucket:

```ts
@Post(':endpointId')
@UnthrottledRoute('signed by its sender: the HMAC signature is the credential, not a request budget')
receive() {
  // ...
}
```

A CI check fails the build if any kernel or module route declares neither.

## What counts as one caller

Requests are counted per tenant and per identity: the authenticated user id when there is one, the caller's IP otherwise. Two tenants, or two users within the same tenant, never share a counter.

## When the store is unreachable

A rate limiter that blocks every request when Redis is down would turn an infrastructure blip into an outage — except for the one bucket where that tradeoff runs the other way. `read` and `write` fail open: if the store cannot be reached, the request goes through uncounted. `auth` fails closed with a 503, because an unreachable counter in front of login is indistinguishable from no rate limit at all, and that is exactly the bucket protecting against credential stuffing.

## Response headers

A request that goes through the guard gets back `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. One that exceeds its bucket gets a 429 with `Retry-After` set to the same value.
