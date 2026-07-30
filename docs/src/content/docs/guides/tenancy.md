---
title: Multi-tenancy
description: How a tenant boundary is resolved once and enforced everywhere, without the caller doing anything.
---

Tenancy in HeryJs is a boundary, not a scope you remember to add to every query. A tenant is resolved exactly once, at the edge of the request, and then invisibly injected into every query that touches a tenant-scoped model.

## Resolution: `TenantMiddleware` and `AsyncLocalStorage`

`TenantMiddleware` runs before anything else, ahead of guards and interceptors — it wraps the entire rest of the pipeline in its own callback, so context set here is visible everywhere downstream, including inside guards. It never trusts a client-supplied value for tenant identity: it validates the session's bearer token through `AuthProvider.validateSession()` and reads `tenantId` off the authenticated user, then stores it in an `AsyncLocalStorage` context (`TenantContextStorage`) for the lifetime of that request — no need to thread it through every function call by hand, and nothing a caller can override by sending a header.

## Enforcement: the tenant-scoped Prisma client

`createTenantScopedPrismaClient()` wraps a plain `PrismaClient` in a Prisma `$extends` query extension. For every model listed in `TENANT_SCOPED_MODELS`:

- on `create` / `createMany`, the current tenant id is injected into the data automatically;
- on every read/update/delete operation, a `tenantId` filter is injected into the `where` clause automatically.

A caller writing `this.prisma.workout.findMany({})` gets tenant-scoped results without ever mentioning a tenant. There is no code path where a developer can forget the filter, because the filter isn't written by the developer in the first place.

## What this buys you

A cross-tenant data leak would require either bypassing the extension entirely (using the raw, non-scoped client) or removing a model from `TENANT_SCOPED_MODELS` — both of which are visible in a code review, unlike a missing `WHERE tenant_id = ?` buried in one query among hundreds.

## Optional second layer: Postgres row-level security

The application-layer boundary above is enough on its own — every generated resource is proven tenant-isolated over a real HTTP round trip. For deployments that want a second, database-level backstop, set `RLS_ENABLED=true` to have tenant-scoped operations run inside a transaction that sets `app.tenant_id` via `set_config`, matching a `FORCE ROW LEVEL SECURITY` policy applied to each tenant-scoped table. This only constrains a genuinely restricted database role (`NOSUPERUSER NOBYPASSRLS`) — a superuser connection always bypasses RLS, flag or not — so it protects against a compromised or misconfigured connection using anything less than superuser credentials, not against the app's own default connection.
