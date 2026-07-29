---
title: Multi-tenancy
description: How a tenant boundary is resolved once and enforced everywhere, without the caller doing anything.
---

Tenancy in HeryJs is a boundary, not a scope you remember to add to every query. A tenant is resolved exactly once, at the edge of the request, and then invisibly injected into every query that touches a tenant-scoped model.

## Resolution: `TenantMiddleware` and `AsyncLocalStorage`

`TenantMiddleware` runs before anything else and reads the tenant identifier for the current request (an `x-tenant-id` header in development), then stores it in an `AsyncLocalStorage` context (`TenantContextStorage`) for the lifetime of that request — no need to thread it through every function call by hand.

## Enforcement: the tenant-scoped Prisma client

`createTenantScopedPrismaClient()` wraps a plain `PrismaClient` in a Prisma `$extends` query extension. For every model listed in `TENANT_SCOPED_MODELS`:

- on `create` / `createMany`, the current tenant id is injected into the data automatically;
- on every read/update/delete operation, a `tenantId` filter is injected into the `where` clause automatically.

A caller writing `this.prisma.workout.findMany({})` gets tenant-scoped results without ever mentioning a tenant. There is no code path where a developer can forget the filter, because the filter isn't written by the developer in the first place.

## What this buys you

A cross-tenant data leak would require either bypassing the extension entirely (using the raw, non-scoped client) or removing a model from `TENANT_SCOPED_MODELS` — both of which are visible in a code review, unlike a missing `WHERE tenant_id = ?` buried in one query among hundreds.

Row-level security at the database layer is intentionally not part of this — the tenant boundary lives in the application layer, backed by tests that prove tenant A never sees tenant B's records over a real HTTP round trip.
