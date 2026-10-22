---
title: Cache
description: A tenant-namespaced cache on the Valkey the kernel already depends on, with nothing to wire up per resource.
---

There was no cache layer before this — every project that needed one reached for its own `cache-manager` and wired its own keys. It is in the kernel rather than a module: an optional cache is one the kernel itself can never rely on, and the rate limiter needs the same store anyway.

## Reading and writing

`CacheService` is exported globally, so any provider can inject it without importing `CacheModule`:

```ts
constructor(private readonly cache: CacheService) {}

async summary(): Promise<Summary> {
  const cached = await this.cache.get<Summary>('summary');

  if (cached) {
    return cached;
  }

  const computed = await this.compute();
  await this.cache.set('summary', computed);

  return computed;
}
```

`set` takes a TTL in seconds as its third argument; left out, it falls back to `cache.defaultTtlSeconds` in `hery.config.ts`:

```ts
export default {
  cache: {
    defaultTtlSeconds: 300,
  },
} satisfies HeryConfig;
```

## Every key carries the tenant

This is not a preference, it is the one thing that would make a cache dangerous to skip: `CacheService` reads the tenant off `TenantContextStorage` and namespaces every key with it. Two tenants can both cache something at the key `report`, and neither ever reads the other's value — the same guarantee the Prisma extension and the row-level policy give a query, extended to the cache in front of it.

## Invalidating a whole prefix

```ts
await this.cache.invalidate('blog-post:');
```

Drops every key starting with that prefix, scoped to the calling tenant. Written as a cursor scan rather than `KEYS`, which blocks the whole server for as long as the scan takes — fine against a handful of keys locally, an incident against a real keyspace.

## Caching a read route

`@CacheOutput` caches what a GET route returns and drops it when a write touches the models it reads:

```ts
@RateLimit('read')
@Get()
@Capability(canListPosts)
@CacheOutput({ ttlSeconds: 60, models: ['Post'] })
async list(@Query() query: unknown) { ... }
```

- **Key.** The tenant (through `CacheService`), then a hash of the caller as the capability check sees it (user, role, current team, teams, impersonation), the full URL with its query string and `Accept-Language`. Two callers whose scopes could differ never share an entry, and neither do two tenants.
- **Guards first.** Interceptors run after guards, so the session and `@Capability` still decide every request, a hit included.
- **Invalidation.** Every write to a tenant-scoped model leaves a `model.*` message in the outbox in the same transaction; the `output-cache` outbox handler drops that tenant's entries naming the model. A rolled-back write drops nothing, and a write from a job or the CLI drops as much as one from a route. A response can stay stale for as long as the outbox relay takes to deliver, and never longer than the TTL.
- **Shares.** Granting or revoking a share on a record drops the entries naming the record's model, through a `model.shared` outbox message, so a revoked reader is not served the record from the cache.
- **Feature flags.** A flag write does not go through the outbox, so it drops nothing. A route whose output depends on a flag (a handler that checks one) keeps serving the previous answer for up to its TTL after the flag is flipped. Keep such a route uncached, or give it a TTL you can accept as the delay of a flip.
- **What is stored.** Only a 2xx body of a GET with a tenant. Each response carries `X-Output-Cache: HIT` or `MISS`.
- **Visibility.** `http_output_cache_requests_total{route,result}` on `/metrics`, and an "Output cache" section in the admin (Performance group) listing each cached route with its TTL, models, hits and misses, with a "Flush output cache" action for the current tenant. Both are this process's counts.

## What this is not

`CacheService` itself is not a read-through or write-through layer and does not invalidate on write: a resource that caches something through it decides for itself when to drop it. The tenant guarantee is the only thing this service enforces on your behalf; everything else — what to cache, for how long, when it goes stale — is a decision the code calling it makes explicitly, the same way the rest of this framework prefers a decision written where you can read it over one made for you.
