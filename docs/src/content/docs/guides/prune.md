---
title: Prune
description: A scheduled, configurable hard delete for whatever a model's soft delete has been quietly accumulating.
---

Soft delete never actually frees anything — a `deletedAt` row sits in the table forever, still counted by every unscoped query that forgets to filter it out. Prune is the other half: it hard-deletes rows that have been soft-deleted longer than a retention window you choose, on a schedule, with nothing to wire up per model.

## What is prunable

A model is prunable exactly when it carries both `deletedAt` and `tenantId` — the two reserved fields every blueprint with a `delete` preset gets automatically. `src/technical/prune/prunable-models.ts` reads this straight off Prisma's own DMMF at runtime:

```ts
const REQUIRED_FIELDS = ['deletedAt', 'tenantId'];

export function prunableModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => {
      const names = new Set(model.fields.map((field) => field.name));
      return REQUIRED_FIELDS.every((field) => names.has(field));
    })
    .map((model) => model.name);
}
```

Nothing to generate, nothing to patch, nothing to remember: a new soft-deletable resource is prunable the moment it exists.

`tenantId` is part of that condition, not an assumption about it. Pruning reads the column twice: once to attribute each deletion to the right tenant's audit chain, once to bound a run triggered from a request. A hand-written model carrying `deletedAt` alone is left out of the list rather than pruned without either.

## Configuring retention

Retention lives in `hery.config.ts`, next to `search` — a scheduled, project-wide policy belongs there, not scattered across blueprints or decorators.

```ts
export default {
  prune: {
    default: { retentionDays: 30 },
    overrides: {
      BlogPost: { retentionDays: 90 },
    },
  },
} satisfies HeryConfig;
```

`default` applies to every prunable model. `overrides` is keyed by model name and only needs to state what differs — a model absent from `overrides` simply gets `default`. Omitting the `prune` block entirely turns pruning off: nothing runs, nothing is listed, and the admin page shows nothing to prune.

## `lock`: skip the schedule, not the operation

```ts
prune: {
  default: { retentionDays: 30 },
  overrides: {
    Invoice: { retentionDays: 365, lock: true },
  },
},
```

`lock` does not add a second permission tier — `canManagePrune` already restricts the whole feature to `role: 'admin'`, and there is no stronger role to gate a locked model behind. What `lock` changes is who decides *when*: an unlocked model is swept by the daily cron the moment it is due; a locked one is skipped by that cron and only prunes when an admin explicitly triggers it. Use it for a model where hard-deleting a full year of records is not something you want to happen unattended, even by a rule you wrote yourself weeks ago.

## Exposed to the mine, not routed by hand

`PruneService` carries no controller of its own. `status()` and `run()` are `@ExposeAction`s — see [Exposing an action to the mine](/guides/exposing-actions) — reached through the framework's one generic route rather than a `POST /prune/...` pair, with `canManagePrune` as each action's own capability.

```ts
@ExposeAction('prune.status', { capability: canManagePrune })
status(): PruneModelStatus[] { ... }

@ExposeAction('prune.run', { capability: canManagePrune })
async run(
  @ExposeField('prune.run.model', { kind: 'enum', values: prunableModels(), default: prunableModels()[0] ?? '' })
  model: string,
  @ExposeField('prune.run.retentionDays', { kind: 'number', min: 1, max: 3650, default: DEFAULT_RETENTION_DAYS })
  retentionDays: number,
): Promise<PruneRunResult> { ... }
```

```json
POST /expose/prune.run
{ "prune.run.model": "BlogPost" }
→ 201 { "data": { "model": "BlogPost", "deletedCount": 3 }, "messages": [] }
```

`model` is a closed list — the mine renders it as a menu, not free text, and an unlisted name is rejected before `run()` ever sees it. `retentionDays` defaults to `hery.config.ts`'s own `prune.default.retentionDays`, and its declared minimum is `1`: a manual run can shorten the window for that one call, but never to `0`, which would purge everything soft-deleted a second ago.

`canManagePrune` answers one question — is this caller trusted with a hard delete — and never "whose rows may it reach". An admin is an admin of its own tenant, so a run triggered this way is bounded by the request's tenant context like every other write made on a caller's behalf: `run()` passes `TenantContextStorage.getTenantId()` down to the sweep, and rows belonging to any other tenant are not read, not deleted, and not audited.

## The scheduled run

`src/technical/prune/prune.task.ts` runs once a day, through the same `ScheduledTaskStore` the heartbeat task uses, so a failed run shows up in `/scheduler/tasks` like any other:

```ts
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'prune' })
async run(): Promise<void> {
  await this.store.run('prune', async () => {
    await this.prune.pruneDue();
  });
}
```

`pruneDue()` walks every prunable model, skips the ones whose rule sets `lock`, and hard-deletes the rest. It runs on `authPrismaClient` — the same unscoped client audit-log and impersonation writes use — and passes no tenant down, because the scheduled sweep is the one path that legitimately spans every tenant at once: it is a system job, not a request made on anyone's behalf. That is also why the tenant has to travel as an argument rather than be inferred from the client: the same method serves both paths, and only one of them is allowed to cross the boundary.

## It writes to the audit log too

A hard delete is the one thing the audit log cannot skip, so pruning does not go through `deleteMany` blind: it reads the exact rows first, deletes them by id, then writes one audit entry per tenant those rows belonged to, with `operation: 'prune'` and the deleted ids — not just their count — in `data`. `recordId` is still `null`, since there is no single record to name, but knowing exactly what disappeared beats a number on a hard delete: a count says how many rows are gone, an id list says which ones.

The read, the delete and every one of those audit writes share a single `authPrismaClient.$transaction`. Splitting them was the previous shape's real gap: a process killed between the `deleteMany` and a separate, unwrapped `writeAuditLog` call would leave rows gone with no trace they ever existed. `writeAuditLogInTransaction` — the same hash-chained append `writeAuditLog` itself wraps in its own transaction — is what makes joining it into an outer one possible, since Prisma's interactive transaction client cannot open a nested `$transaction` of its own.

The actor differs by path. `run()` is always called from a request, so it attributes the entry to whoever is signed in — `TenantContextStorage.getUserId()` and `getImpersonatedBy()`, the same session-derived pair every other write in the codebase uses. The scheduled `pruneDue` run has no caller behind it at all, so its entries carry a `null` actor rather than inventing one.

## Purge is the same operation, reached a different way

Every generated service also carries a `purge(record)` method: it writes the audit entry first, then hard-deletes through `authPrismaClient`, the same unscoped client `pruneDue` runs on. It is the single-record version of what pruning already does in bulk on a schedule — not a second hard-delete mechanism.

Writing the entry by hand is what forces the unscoped client here: going through the tenant-scoped one would have its audit extension append a second entry for the same delete and fork the chain. So the tenant travels in the `where` clause instead — `{ id: record.id, tenantId: record.tenantId }`. The boundary still applies, it is simply stated rather than injected, and a record that somehow came from another tenant matches no row rather than being erased. Unlike `hardDelete`, it has no route: purge is reserved for the admin decorator system a resource can opt into later, gated by its own `canPurge{Resource}` capability rather than `canHardDelete{Resource}`, so a future route can impose stricter rules (a second admin's approval, say) without touching the delete route's own contract.

## The admin page

Installing the admin module gives you a dedicated `/prune` page: one row per configured model, its retention window, whether it is locked or automatic, and a **Prune now** button that posts to `/expose/prune.run` directly. It is not part of the generic auto-discovered resource list: the panel only auto-discovers argument-free `GET`s and `POST .../search` routes, and `/expose` itself is explicitly hidden from that discovery — it is the mine's own catalog route, not a section in its own right.
