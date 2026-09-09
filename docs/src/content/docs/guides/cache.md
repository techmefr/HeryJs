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

## What this is not

A read-through or write-through layer, and no automatic invalidation on write: a resource that caches something decides for itself when to drop it. The tenant guarantee is the only thing this service enforces on your behalf; everything else — what to cache, for how long, when it goes stale — is a decision the code calling it makes explicitly, the same way the rest of this framework prefers a decision written where you can read it over one made for you.
