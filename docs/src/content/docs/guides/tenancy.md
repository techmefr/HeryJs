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

A caller writing `this.prisma.blogPost.findMany({})` gets tenant-scoped results without ever mentioning a tenant. There is no code path where a developer can forget the filter, because the filter isn't written by the developer in the first place.

## Work with no request behind it

A queue worker, a scheduled task or a CLI backfill never went through `TenantMiddleware`, so there is no ambient tenant to stamp — and a tenant-scoped write from there throws rather than landing somewhere plausible. `runInTenant(tenantId, fn)` (`src/technical/tenancy/run-in-tenant.ts`) opens the context explicitly, from the tenant the job already carries. The webhooks processor is the example: it reads `event.tenantId` off the row it is processing and notifies that tenant's admins inside it.

There is deliberately no default tenant to fall back on. A worker that forgets the context fails loudly on the first write, which is the failure you want — the alternative is rows quietly filed under `"default"`.

## What this buys you

A cross-tenant data leak would require either bypassing the extension entirely (using the raw, non-scoped client) or removing a model from `TENANT_SCOPED_MODELS` — both of which are visible in a code review, unlike a missing `WHERE tenant_id = ?` buried in one query among hundreds.

## Provisioning a tenant is deliberately absent

There is no `Tenant` model and no endpoint that creates one — a tenant is just a string column, and `User.tenantId` defaults to `"default"`. That default is correct for a freshly generated project: one deployment, one company, every signup is a coworker who lands in the same tenant and then organizes into teams. `POST /auth/register` is public precisely because there is only one tenant to join.

That stops being correct the moment one deployment serves more than one tenant — a real multi-tenant SaaS, several customers sharing a database, each meant to be isolated from the others. Nothing here notices that shift. Left wired exactly as generated, `POST /auth/register` keeps doing what it always did: putting every new signup into the one tenant that already exists, silently merging customers who were supposed to be separate. The application-layer boundary described above still holds — a caller only ever sees rows tagged with their own `tenantId` — it just isn't the boundary you meant to draw if "default" now contains three unrelated companies.

Deciding how a new tenant comes into being — from a subdomain, an invitation token, an admin-provisioned account — is a product decision, the same way team roles and invitations are (see [Teams](/guides/teams/)). HeryJs gives you the boundary and enforces it on every query; it does not guess your provisioning story. Running real multi-tenancy means replacing or gating `AuthController.register` (`src/technical/auth/auth.controller.ts`) yourself, so a new signup is assigned the tenant it actually belongs to instead of inheriting the schema default.

## Optional second layer: Postgres row-level security

The application-layer boundary above is enough on its own — every generated resource is proven tenant-isolated over a real HTTP round trip. For deployments that want a second, database-level backstop, set `RLS_ENABLED=true` to have tenant-scoped operations run inside a transaction that sets `app.tenant_id` via `set_config`, matching a `FORCE ROW LEVEL SECURITY` policy applied to each tenant-scoped table. This only constrains a genuinely restricted database role (`NOSUPERUSER NOBYPASSRLS`) — a superuser connection always bypasses RLS, flag or not — so it protects against a compromised or misconfigured connection using anything less than superuser credentials, not against the app's own default connection.

The policy fails closed: `current_setting('app.tenant_id', true)` is `NULL` when the variable was never set, and `"tenantId" = NULL` is never true, so a connection that skipped the session variable sees no rows rather than all of them.

### The policy is emitted, not remembered

Writing that migration by hand is how the teams tables spent a month scoped by the extension with nothing behind them. `pnpm hery migrate` now reads the schema and `TENANT_SCOPED_MODELS`, and emits the `ENABLE ROW LEVEL SECURITY` migration for any tenant-scoped table that has no policy yet — including the table `hery generate` just added. A model whose `tenantId` is nullable gets `"tenantId" IS NULL OR …`, so rows belonging to no tenant (a global feature flag) stay visible instead of disappearing.

`pnpm lint:rls` is the guarantee. It answers two questions about every model the schema declares.

First: does it carry a `tenantId` at all? A table gets the column in the migration that creates it, or it is listed in `TENANT_FREE_MODELS` with the reason it cannot have one — today better-auth's own `Session`, `Account` and `ApiKey`, written by an adapter that would never stamp a column HeryJs added, and `Verification`, whose tokens are looked up by value before any session exists. Nothing else is allowed to have none. Retrofitting the column is the expensive half: adding it later means backfilling rows whose tenant nobody ever recorded, and there is no honest value to put in them.

Second, for a model that carries one: which of the two enforcement paths is it on? The check fails if it is neither, both, or governed without a policy:

- in `TENANT_SCOPED_MODELS` — filtered and stamped by the extension, and covered by a row-level policy;
- in `APP_ENFORCED_TENANT_MODELS` — written through `authPrismaClient`, which has no extension and never sets `app.tenant_id`, so a policy there would block the writes that fill the table. Each of these passes an explicit `tenantId` at the call site. That is weaker than a boundary, which is why the list is written down rather than implied: `User`, `AuditLog`, `FeatureFlag`, `MailLog`, `WebhookEndpoint`, `WebhookEvent`.

A spec then reads `pg_policies` and `pg_class` on the real database, so a migration that was edited, reverted or never applied fails too — the check proves the file exists, the spec proves the database agrees.
