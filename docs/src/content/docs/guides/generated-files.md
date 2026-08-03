---
title: What gets generated
description: A tour of every file hery generate writes for a single resource, and what each one owns.
---

Running `hery generate Task` writes nine files into `src/functional/task/`. Each one owns exactly one concern, and each one is plain NestJS you edit afterwards like anything else.

## `task.dto.ts`

Zod schemas for create and update payloads, derived from the blueprint's fields. `updateTaskSchema` is `createTaskSchema.partial()` — every field becomes optional on update, without repeating the shape.

## `task.policy.ts`

The exported policy functions and a small `TaskPolicy` class.

Six functions, one per question a route can ask: `canCreateTask`, `canViewTask`, `canViewAnyTask`, `canUpdateTask`, `canDeleteTask`, `canListTrashedTask`. Each is a one-liner resolving a blueprint preset, and they are plain exported functions rather than class methods so a decorator can reference them at import time — and so a GraphQL resolver or an MCP tool can call the same rule without going through a guard.

Two of them are worth noticing. `canViewAnyTask` uses the same preset as `canViewTask`, which is what makes the list route and the detail route answer the same question. And `canListTrashedTask` follows the *delete* preset rather than the read one, on the grounds that opening the bin is a moderation move.

`TaskPolicy` is the injectable half, resolving the decisions attached to a record or a collection for `?include=capabilities`.

## `task-record.loader.ts`

Two loaders, not one, and the distinction matters.

`TaskRecordLoader` finds a record regardless of its soft-delete state, because update, delete and restore all need it — restore specifically targets trashed rows. `TaskVisibleRecordLoader` returns `null` for a soft-deleted record, so a plain read cannot resurface something that has been thrown away.

The controller picks per route, which is why deleting then fetching a record gives you a 404 while restoring it still works.

## `task.service.ts`

`search`, `create`, `update`, `softDelete`, `restore` — all going through the tenant-scoped Prisma client, so tenancy is enforced without the service ever mentioning a tenant id.

`search()` is the interesting one. It composes the capability scope, the soft-delete state and the caller's filters as **separate `AND` branches**:

```ts
where: {
  AND: [
    scopeWhereFor('own', subject),
    trashedWhere,
    { ...options.filters, ...searchWhere },
  ],
}
```

Its own branch, not a spread, so a declared filter can never widen the scope back — whatever the caller puts in the query string.

Each mutation also publishes on the resource's signal channel and syncs the search index if a driver is installed. If any preset is `team`, `create()` additionally refuses with a 409 when the caller has no current team, and stamps `teamId` from the session.

## `task.controller.ts`

The HTTP surface: seven routes, each behind `SessionGuard` and `CapabilitiesGuard`, each response passed through `task.view.ts` before it leaves the process.

| Route | Capability | Loader |
|---|---|---|
| `POST /tasks/search` | `canViewAnyTask` | — |
| `GET /tasks/describe` | `canViewAnyTask` | — |
| `GET /tasks/:id` | `canViewTask` | visible only |
| `POST /tasks` | `canCreateTask` | — |
| `PATCH /tasks/:id` | `canUpdateTask` | including trashed |
| `DELETE /tasks/:id` | `canDeleteTask` | including trashed |
| `POST /tasks/:id/restore` | `canUpdateTask` | including trashed |

The search route parses its body through the shared `parseSearchRequest` against the blueprint's contract, checks `canListTrashedTask` separately if the caller asked for trashed rows, and returns `meta.channels` so a client knows what to subscribe to for invalidation.

## `task.module.ts`

The Nest module: the controller, the service, the policy, and both record loaders bound to their injection tokens. Generated because the wiring is mechanical, and left to you afterwards because the moment a resource needs another provider, this is where it goes.

It is not imported anywhere for you — `generate` prints that as step one. `src/app.module.ts` stays a file you own.

## `task.view.ts`

A Zod schema for the response shape plus a pure function, `toTaskView(record)`, that parses a record through it. Any field marked `hidden` in the blueprint is destructured away first, so it cannot leave the process no matter which endpoint returns the record.

If nothing is hidden it is effectively an identity function — still generated, so the controller's shape does not change depending on whether a resource happens to have secrets to hide today. The schema being explicit is also what keeps a column added later from silently appearing in API responses.

## `task.factory.ts`

A plain exported function, not a class, backed by `@faker-js/faker` for default field values:

```ts
taskFactory({ ownerId }, { count: 5 });      // five records at once
taskFactory({ ownerId, trashed: true });     // a soft-deleted record
taskFactory({ ownerId: existingUser.id });   // "recycle" — just pass the existing id
```

## `task.spec.ts`

An end-to-end HTTP test, generated once and meant to be extended by hand. Eleven cases for the default permission presets: creation is scoped to the current tenant, the describe route reports the blueprint's fields and rules, the collection and detail routes agree on who may see a record, same for the trash, listing resolves each record's capabilities, a non-owner gets a real 403 on update, soft-delete and restore round-trip, a different tenant never sees another tenant's records, a client-supplied tenant header cannot spoof the tenant, and full-text search finds a record through the named default engine while an undeclared engine keyword is rejected. See [Testing conventions](/guides/testing/).

## Optional extras

Four flags each add one more file, for a resource that should also be reachable another way:

| Flag | File | Adds |
|---|---|---|
| `--graphql` | `task.resolver.ts` | queries and mutations |
| `--mcp` | `task.mcp-tools.ts` | five MCP tools |
| `--live` | `task.live.gateway.ts` | a WebSocket namespace |
| `--stream` | `task.stream.controller.ts` | LiveKit token routes |

Each requires its module to be installed, and each re-checks the resource's own policy functions rather than inventing its own rules.

## What it also patches

`prisma/schema.prisma` gains the model — `id`, `tenantId`, `ownerId`, your fields, timestamps and a nullable `deletedAt`, plus a `teamId` if any preset is `team`. Then two sets in the kernel gain the model's name: `TENANT_SCOPED_MODELS` in `prisma.client.ts` and `AUDITED_MODELS` in `audit-log.ts`. Those two patches are what make tenancy and the audit trail automatic for the new resource rather than something to remember — a set the generator does not maintain is a feature that silently applies to nothing.
