---
title: Security model
description: What the kernel enforces on every request, what it deliberately leaves to you, and how to report a vulnerability.
---

HeryJs generates code and disappears, so most of what follows is not a service watching your app at runtime — it is a shape the generator writes and a set of checks that fail your build when a route leaves it. That distinction matters when you audit a project: what protects a generated resource is visible in its own files.

## The order every request goes through

1. **Who is calling** — a session cookie or a bearer API key, resolved once.
2. **Which tenant** — resolved from the caller, not from the request body.
3. **What they may do** — the route's capability, evaluated server-side.
4. **What they sent** — a zod schema per route, rejecting anything outside it with a 400.

Each step is independent of the one before it, and none of them trusts the client. A frontend that decides a button should be enabled changes nothing about step 3.

## The tenant is a boundary, not a filter

A tenant is resolved once per request into an `AsyncLocalStorage` context and injected **underneath** permissions, so no query passes it explicitly and no caller can widen it.

Two layers enforce it, on purpose:

- **A Prisma extension** adds the tenant condition to every query on a tenant-scoped model.
- **Postgres row-level security** does it again in the database. `hery migrate` emits the policy with the tables:

  ```sql
  ALTER TABLE "BlogPost" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "BlogPost" FORCE ROW LEVEL SECURITY;
  -- USING ("tenantId" = current_setting('app.tenant_id', true))
  ```

  `FORCE` matters: without it the table owner bypasses its own policy, which is exactly the role your app connects as. And the policy fails closed — `current_setting('app.tenant_id', true)` is `NULL` when nothing set it, and `"tenantId" = NULL` is never true, so a request that somehow reaches the database with no tenant sees no rows rather than all of them.

A handful of tables cannot carry a policy — the ones a request touches before a tenant exists, and the ones that are deliberately tenant-free. Those are declared, not forgotten: `lint:conventions` accounts for **every** table as covered by a policy, enforced in code, or tenant-free with a recorded reason, and fails on a new table that is none of the three.

## Permissions are decisions, never rules

The backend never sends its permission rules to the frontend. It resolves them server-side into `{ allowed, scope }` and attaches those to the data. The frontend uses them for UX; the backend re-checks on every call regardless.

Every route carries `@Capability(...)` or `@PublicRoute('<why>')` — the second one takes a reason, in prose, and a route carrying neither fails CI. That check is the reason a route cannot be added unprotected by accident: it is not a review habit, it is a build failure.

Capabilities are computed in memory on objects already loaded, with conditions restricted to fields already selected. There is no per-row query, so no permission check degrades into an N+1 that someone later "optimises" by removing it.

## Rate limiting is on by default

Every kernel and module route carries `@RateLimit(<bucket>)` or `@UnthrottledRoute('<why>')`, the same way every route carries a capability decision — a route with neither fails CI. Three buckets (`read`, `write`, `auth`) cap requests per tenant and identity, tight enough on `auth` to blunt credential stuffing without a project having to configure anything. See [Rate limiting](/guides/rate-limiting/).

## Sessions and API keys

Interactive login is [better-auth](https://better-auth.com) over Prisma, with email and password enabled and a bearer plugin.

API keys exist for CI and scripts, and are stored the way GitHub stores its tokens: a public lookup prefix plus a SHA-256 hash of the secret, never the secret. Verification compares digests with `timingSafeEqual`, and a key expires on its own clock rather than depending on a login flow. A leaked key is revocable without touching anyone's session.

## Impersonation is bounded

An admin can act as another user; the session is time-limited from the moment it opens, a scheduled task ends the ones that have expired, and the whole of it is audited. There is no role-management endpoint: `admin` is granted in the database by hand, because who may impersonate is a product decision and not a convention to ship.

## The audit trail records the actor

Audited writes are appended with the acting user, so "who changed this" is answerable after the fact. The list of audited models is one declaration, read and rewritten by the generator rather than maintained in several places.

## HTTP surface

- **Security headers** through helmet, wired as an application middleware rather than in `main.ts` — the one file no test boots — with a content security policy of `default-src 'none'` and no script at all. The only HTML this API serves is its error page.
- **CORS** declared in `cors.config.ts`, in one place, per environment. Declaring no origin turns it off, and the app says so on boot instead of guessing.
- **Development-only routes** sit behind a guard that answers `404` in production, so their existence is not disclosed. A convention check refuses a controller that hand-rolls its own production test, because two spellings of that check is how one of them ends up wrong.
- **Webhooks** verify an HMAC-SHA256 signature with `timingSafeEqual` and refuse a timestamp outside a tolerance, so a captured request cannot be replayed later.

## What HeryJs does not do

Naming these is part of the model:

- **No secret management.** Configuration comes from the environment. Where those values live in production is yours.
- **No authorisation for your own code.** Capabilities cover generated routes. A controller you write by hand carries whatever you put on it — which the CI check will demand, but only as a decorator, not as a correct rule.
- **No protection against your own generated code once edited.** Every generated file is yours to change, including the policy. The linter checks shape, not intent.
- **No dependency scanning of your project.** This repository watches its own.

## A fix does not travel backwards

Generated code is owned and never re-synced, so a fix released here reaches new projects and reaches an existing one only when its developer applies it. Advisories therefore name the generated file and show the corrected version of it, not only the release that fixes the generator.

## Reporting a vulnerability

Privately, through GitHub: **Security → Report a vulnerability** on [the repository](https://github.com/techmefr/HeryJs/security/advisories/new). That opens an advisory only you and the maintainer can read. The full policy, including what is in scope, is in [SECURITY.md](https://github.com/techmefr/HeryJs/blob/main/SECURITY.md).
