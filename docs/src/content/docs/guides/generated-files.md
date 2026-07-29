---
title: What gets generated
description: A tour of every file hery generate writes for a single resource, and what each one owns.
---

Running `hery generate Task` on a blueprint with one `title` field writes eight files. Each one owns exactly one concern.

## `task.dto.ts`

Zod schemas for create and update payloads, derived from the blueprint's fields. `updateTaskSchema` is `createTaskSchema.partial()` — every field becomes optional on update, without repeating the shape.

## `task.policy.ts`

The exported policy functions (`canCreateTask`, `canUpdateTask`, `canDeleteTask`) and a small `TaskPolicy` class that resolves the capabilities attached to a record or a collection for `?include=capabilities`.

## `task-record.loader.ts`

A `RecordLoader` that fetches a `Task` by id for `CapabilitiesGuard` to check the policy against, and to attach to the request as `req.record`.

## `task.service.ts`

`search`, `findOneOrFail`, `create`, `update`, `softDelete`, `restore` — all going through the tenant-scoped Prisma client, so tenancy is enforced without the service ever mentioning a tenant id.

## `task.controller.ts`

The HTTP surface: five routes (search, find one, create, update, soft-delete, restore), each wrapped in `SessionGuard` and `CapabilitiesGuard`, each response passed through `task.view.ts` before it leaves the process.

## `task.factory.ts`

A plain exported function, not a class, backed by `@faker-js/faker` for default field values:

```ts
taskFactory({ ownerId }, { count: 5 });      // five records at once
taskFactory({ ownerId, trashed: true });     // a soft-deleted record
taskFactory({ ownerId: existingUser.id });   // "recycle" — just pass the existing id
```

## `task.view.ts`

A pure function, `toTaskView(record)`, that strips any field marked `hidden` in the blueprint. If nothing is hidden, it's the identity function — still generated, so the controller's shape doesn't change depending on whether a resource happens to have secrets to hide today.

## `task.spec.ts`

An end-to-end HTTP test, generated once and meant to be extended by hand: unauthenticated access is rejected, a record can be created and is scoped to the current tenant, a different user gets a real 403 on update, soft-delete and restore both work, and a different tenant never sees another tenant's records.
