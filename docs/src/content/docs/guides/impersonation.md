---
title: Impersonation
description: Let an admin act as another user for support, without leaving the tenant boundary or the audit trail.
---

```bash
pnpm hery install impersonation
```

Two routes, both behind `SessionGuard`:

```ts
POST   /impersonation/:userId   // start, as an admin
DELETE /impersonation           // stop
```

`POST /impersonation/:userId` returns a bearer token for the target user. Use it exactly like any other session token — every subsequent request authenticates as the target, tenant and capabilities included. `DELETE /impersonation`, called with that same token, ends the session. There is nothing to restore: the admin's own token was never touched by starting the impersonation, so going back to it is just a matter of using it again.

The session this returns is short-lived on purpose — `impersonationSessionDuration` on Better Auth's `admin()` plugin bounds it to `IMPERSONATION_SESSION_SECONDS` (30 minutes by default), so a support session that is never explicitly stopped does not linger indefinitely. An admin cannot impersonate another admin either: Better Auth's own admin plugin refuses that server-side, surfaced here as a 403.

A session past that bound is not merely ignored — `ImpersonationExpiryTask` sweeps expired impersonation sessions once a minute, deletes the row outright and writes an `expire` audit entry, the same shape as an explicit `stop`. The token stops working either way; the sweep is what turns "expired" into "revoked and on the record" instead of a row that just happens to fail its next lookup.

## Why there is no restore step

Better Auth's own impersonation flow is cookie-based — it swaps the session cookie and stashes the admin's original one in a second cookie so it can be restored later. This app is bearer-only and never reads a cookie back, so none of that machinery runs. The target session's token is lifted straight out of the API response instead, and "stopping" is nothing more than deleting that session's own row. The admin's original session was never revoked, so it is still valid the whole time.

## The tenant boundary, checked by hand

`User` is not one of the tenant-scoped models the Prisma extension enforces automatically — the same is true wherever a resource sits outside that list. `ImpersonationService` checks it explicitly before starting a session: an admin can only impersonate a user in their own tenant, and a cross-tenant attempt returns the same "not found" a stale or invalid id would.

## No role-management endpoint

Only the `admin` role gets the built-in `impersonate` permission. As with [Teams](/guides/teams/), granting that role is deliberately not something the framework exposes over HTTP:

```sql
UPDATE "User" SET role = 'admin' WHERE email = '...';
```

## Audited like anything else sensitive

Starting and ending a session both write a hash-chained audit row (`writeAuditLog`, model `Impersonation`) — who impersonated whom, and when it ended. It goes through the same audit trail as any tenant-scoped model, called directly rather than through the automatic Prisma-extension path, since a Better Auth session is not a model the framework owns.

Every audit row, on any model, also carries `userId` and `impersonatedBy`. A write made while impersonating is attributed to the target — the row's `userId` is the target's id, exactly as it would be if the target had made the request themselves — while `impersonatedBy` keeps the admin visible. The hash chain covers both fields, so altering either after the fact breaks the same tamper check that protects the rest of the entry.

## Installing

The module patches four kernel files it does not own — the schema, the Better Auth plugin list, `AuthenticatedUser`, and the session provider — so a fresh install needs a migration:

```bash
pnpm hery migrate --name add_impersonation
```

Next steps after that are the usual ones: import `ImpersonationModule` into `src/app.module.ts`, then promote a user to `admin` by hand.
