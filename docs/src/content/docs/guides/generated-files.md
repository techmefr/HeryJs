---
title: What gets generated
description: A tour of every file hery generate writes for a single resource, and what each one owns.
---

Running `hery generate Task` writes ten files into `src/functional/task/`. Each one owns exactly one concern, and each one is plain NestJS you edit afterwards like anything else.

## `task.dto.ts`

Zod schemas for create and update payloads, derived from the blueprint's fields. `updateTaskSchema` is `createTaskSchema.partial()` — every field becomes optional on update, without repeating the shape.

## `task.presets.ts`

One object, `TASK_PRESETS`, holding the four permission presets the blueprint declared. This is what the blueprint *became*: it is never read again at runtime, so the presets have to live somewhere in code, and they live here once.

Everything downstream reads this object — the policy functions, the service's collection query, the view. Nothing repeats a `'own'` or `'team'` literal of its own, which is the point: a preset tightened in the policy and forgotten in the service produces a record the detail route refuses and the list route hands out in full. `pnpm lint:scope-parity` fails the build on any call that passes a literal instead.

Changing a permission after generation is therefore a one-line edit here, not a search-and-replace across three files.

## `task.policy.ts`

The exported policy functions and a small `TaskPolicy` class.

One function per question a route or a payload entry can ask. They come in pairs: a record-level check (`canViewTask`, `canUpdateTask`, `canDeleteTask`, `canRestoreTask`) resolving a preset against one loaded record, and a collection-level one (`canViewAnyTask`, `canUpdateAnyTask`, `canDeleteAnyTask`, `canRestoreAnyTask`) answering "may this caller reach the route at all" before any record is loaded. That split is what a bulk route needs: the guard admits the request, then each entry in the array is checked on its own record. Alongside them, `canCreateTask`, `canListTrashedTask`, `canHardDeleteTask`, `canPurgeTask` and one pair per mutable relation (`canAttachTagsToTask`, `canDetachTagsFromTask`).

Each is a one-liner resolving a blueprint preset, and they are plain exported functions rather than class methods so a decorator can reference them at import time — and so a GraphQL resolver or an MCP tool can call the same rule without going through a guard.

Two are worth noticing. `canViewAnyTask` uses the same preset as `canViewTask`, which is what makes the collection route and a single-record read answer the same question. And `canListTrashedTask` follows the *delete* preset rather than the read one, on the grounds that opening the bin is a moderation move.

`TaskPolicy` is the injectable half, resolving the decisions attached to each record and to the collection when a search request names them in its `capabilities` array.

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
    scopeWhereFor(TASK_PRESETS.view, subject),
    trashedWhere,
    { ...options.filters, ...searchWhere },
  ],
}
```

Its own branch, not a spread, so a declared filter can never widen the scope back — whatever the caller puts in the query string.

Each mutation also publishes on the resource's signal channel and syncs the search index if a driver is installed. If any preset is `team`, `create()` additionally refuses with a 409 when the caller has no current team, and stamps `teamId` from the session.

## `task.controller.ts`

The HTTP surface: six routes, each behind `SessionGuard` and `CapabilitiesGuard`, each response passed through `task.view.ts` before it leaves the process. There is no `GET /tasks/:id` — reading one record is the search route filtered to an id, so there is one contract to learn instead of two, and [Details](/guides/endpoints/details/) explains why.

| Route | Capability at the guard | Per-record check |
|---|---|---|
| `POST /tasks/search` | `canViewAnyTask` | the view preset, as a `where` clause |
| `GET /tasks/describe` | `canViewAnyTask` | — |
| `POST /tasks/create` | `canCreateTask` | — |
| `POST /tasks/update` | `canUpdateAnyTask` | `canUpdateTask` per entry, on the loaded record |
| `POST /tasks/delete` | `canDeleteAnyTask`, plus `canHardDeleteTask` once for the whole request when `mode: 'hard'` | `canDeleteTask` per entry |
| `POST /tasks/restore` | `canRestoreAnyTask` | `canRestoreTask` per entry |

Every mutating route takes an array and answers with one result per entry, each carrying its own `status`, so one refused record never blocks the others. The guard admits the caller to the route; the per-record function above is what decides each entry.

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

An end-to-end HTTP test, generated once and meant to be extended by hand. Seventeen cases for the default permission presets: creation is scoped to the current tenant, the describe route reports the blueprint's fields and rules, a record read one way and listed the other agree on who may see it, same for the trash, a search resolves the capabilities it asked for, a non-owner gets a real 403 on update, soft-delete and restore round-trip while restoring a live record is refused, a different tenant never sees another tenant's records, a client-supplied tenant header cannot spoof the tenant, pagination reports its meta and rejects an undeclared page size, an include or an aggregate naming an undeclared relation is rejected, full-text search finds a record through the named default engine while an undeclared engine keyword is rejected, and a relation attaches, syncs and detaches through the update route. See [Testing conventions](/guides/testing/).

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

The row-level policy behind that first set is not left to be remembered either: the `pnpm hery migrate` you run next reads the schema and emits the `ENABLE ROW LEVEL SECURITY` migration for the new table before applying it. See [Multi-tenancy](/guides/tenancy/).
