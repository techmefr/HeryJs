---
title: Prune
description: A scheduled, configurable hard delete for whatever a model's soft delete has been quietly accumulating.
---

Soft delete never actually frees anything — a `deletedAt` row sits in the table forever, still counted by every unscoped query that forgets to filter it out. Prune is the other half: it hard-deletes rows that have been soft-deleted longer than a retention window you choose, on a schedule, with nothing to wire up per model.

## What is prunable

A model is prunable exactly when it carries `deletedAt` — the same reserved field every blueprint with a `delete` preset gets automatically. `src/technical/prune/prunable-models.ts` reads this straight off Prisma's own DMMF at runtime:

```ts
export function prunableModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'deletedAt'))
    .map((model) => model.name);
}
```

Nothing to generate, nothing to patch, nothing to remember: a new soft-deletable resource is prunable the moment it exists.

## Configuring retention

Retention lives in `hery.config.ts`, next to `search` — a scheduled, project-wide policy belongs there, not scattered across blueprints or decorators.

```ts
export default {
  prune: {
    default: { retentionDays: 30 },
    overrides: {
      Workout: { retentionDays: 90 },
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

## The HTTP surface

Two routes, both behind `SessionGuard` and `@Capability(canManagePrune)` — unlike the scheduler's own `/scheduler/tasks`, neither is `DevOnlyGuard`-gated, because an admin needs to see and trigger this in production.

| Route | What it does |
|---|---|
| `GET /prune` | Every prunable model that has a rule, with its resolved `retentionDays` and `lock`. |
| `POST /prune/:model/run` | Hard-deletes that model's overdue rows now, regardless of `lock`. 404s if the model has no prune configuration. |

```json
POST /prune/Workout/run
→ 201 { "data": { "model": "Workout", "deletedCount": 3 }, "messages": [] }
```

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

`pruneDue()` walks every prunable model, skips the ones whose rule sets `lock`, and hard-deletes the rest. It runs on `authPrismaClient` — the same unscoped client audit-log and impersonation writes use — because pruning is a system job across every tenant at once, not a request made on anyone's behalf.

## It writes to the audit log too

A hard delete is the one thing the audit log cannot skip, so pruning does not go through `deleteMany` blind: it reads the exact rows first, deletes them by id, then writes one `writeAuditLog` entry per tenant those rows belonged to, with `operation: 'prune'` and the count in `data`. `recordId` is `null` — like any bulk operation, there is no single record to name — but the tenant and the count are exactly what makes the sweep visible afterwards instead of leaving a gap in the chain.

The actor differs by path. `pruneNow` is always called from a request, so it attributes the entry to whoever is signed in — `TenantContextStorage.getUserId()` and `getImpersonatedBy()`, the same session-derived pair every other write in the codebase uses. The scheduled `pruneDue` run has no caller behind it at all, so its entries carry a `null` actor rather than inventing one.

## The admin page

Installing the admin module gives you a dedicated `/prune` page: one row per configured model, its retention window, whether it is locked or automatic, and a **Prune now** button that calls the manual-trigger route directly. It is not part of the generic auto-discovered resource list — `GET /prune` is deliberately excluded from that list the same way `/pipeline/traces` is, so it gets this page instead of the flat data table every other resource gets.
