---
title: Capabilities
description: How HeryJs resolves permissions, and why the server never sends rules to the client.
---

A capability is a resolved decision, not a rule: `{ allowed: boolean, scope?: 'own' | 'team' | 'all' }`. The server never sends a permission *rule* to the client — only the outcome of evaluating one, for the current user, against an already-loaded record.

## Presets

Every permission in a blueprint picks one of four presets:

- `own` — allowed if the current user owns the record.
- `team` — allowed if the record belongs to one of the user's teams.
- `all` — always allowed.
- `none` — never allowed.

Resolution happens **in memory**, against a record already fetched for the request — never as a separate query per item. This is what keeps a list endpoint from turning into an N+1 permission check.

The `team` preset resolves against a `teamId` column, so a blueprint that picks it must declare that field — `hery generate` refuses the blueprint otherwise. Be aware that `CapabilitiesGuard` does not resolve team memberships yet: it builds its subject with an empty `teamIds`, so `team` denies every request until you populate it. The generator warns when a blueprint picks it.

## Two levels: collection and record

- **Collection-level** (`resolveCollectionCapability`) answers questions like "can this user create a Workout at all," where there is no specific record to check against yet.
- **Record-level** (`resolveCapability`) answers "can this user update *this* Workout," given the record.

## Reading one record and reading a list are the same question

A detail route resolves a preset against a loaded record. A list route cannot do that — the rows it should not return are exactly the ones it must avoid fetching. So the same preset has to become a `where` clause, and that is what `scopeWhereFor` does:

```ts
export function scopeWhereFor(preset: PermissionPreset, subject: CapabilitySubject): ScopeWhere {
  switch (preset) {
    case 'none':
      return { id: { in: [] } };
    case 'all':
      return {};
    case 'own':
      return { ownerId: subject.id };
    case 'team':
      return { teamId: { in: subject.teamIds } };
  }
}
```

`resolveCapability` and `scopeWhereFor` are mirror images reading the same two columns, and both are fed the blueprint's single `view` preset — the detail route through `canViewX`, the collection query through `scopeWhereFor`. Nothing has to be kept in sync by hand.

This matters because the failure mode is quiet. Written as two independent pieces of code, a filter added to one and forgotten on the other produces a record that returns 403 on its detail route and is handed out in full by the list route. Nothing errors; the endpoint simply answers with data it should have withheld.

The generated `search()` merges the scope clause in its own `AND` branch:

```ts
where: {
  AND: [
    scopeWhereFor('own', subject),
    trashedWhere,
    { ...options.filters, ...searchWhere },
  ],
}
```

Its own branch, not a spread, so a declared filter can never widen it back — whatever the caller puts in the query string.

Listing soft-deleted rows follows the `delete` preset instead of the read one (`canListTrashedX`), on the grounds that opening the bin is a moderation move. The rows that come back are still narrowed by the view scope: the gate answers "may I look at the bin", the scope answers "which rows I may see".

## `@Capability` and `CapabilitiesGuard`

A controller route declares its policy as a plain, exported function — not a class method:

```ts
export const canUpdateWorkout: PolicyCheck<WorkoutRecordLike> = (subject, record) =>
  record ? resolveCapability('own', subject, record) : { allowed: false };
```

```ts
@Patch(':id')
@Capability(canUpdateWorkout)
@LoadRecordWith(WORKOUT_RECORD_LOADER)
async update(@Req() req: RequestWithWorkout, @Body() body: UpdateWorkoutInput) {
  return ok(await this.workouts.update(req.record, body));
}
```

`CapabilitiesGuard` reads the `@Capability` metadata via `Reflector`, loads the record through the `RecordLoader` named in `@LoadRecordWith` (if any), attaches it to the request, and calls the policy function. A `CapabilityForbiddenException` becomes a real HTTP 403 — not a silently filtered list.

Policy functions are plain functions rather than injected class methods on purpose: a decorator is evaluated at import time, before Nest's dependency injection has run, so anything it references has to already exist independently of the DI container.

## Enforced in CI

Generated code belongs to you, which means the generator's guarantees stop the moment you edit it. Two scripts built on the TypeScript Compiler API hold the line instead:

- `scripts/check-capability-decorator.ts` fails the build if any route under `functional/**/*.controller.ts` — reads included, not just `@Post`/`@Patch`/`@Put`/`@Delete` — is missing a `@Capability(...)`. `CapabilitiesGuard` returns `true` when the metadata is absent, so an undecorated read hands out every row its query returns.
- `scripts/check-scope-parity.ts` fails the build if a `search()` method under `functional/**/*.service.ts` does not go through `scopeWhereFor(...)`, which is how a collection query silently loses its scope.

Forgetting either is a build failure, not a runtime surprise.
