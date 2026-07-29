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

## Two levels: collection and record

- **Collection-level** (`resolveCollectionCapability`) answers questions like "can this user create a Workout at all," where there is no specific record to check against yet.
- **Record-level** (`resolveCapability`) answers "can this user update *this* Workout," given the record.

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

A script (`scripts/check-capability-decorator.ts`, built on the TypeScript Compiler API) fails the build if any mutating route (`@Post`, `@Patch`, `@Put`, `@Delete`) under `functional/**/*.controller.ts` is missing a `@Capability(...)` decorator. Forgetting a permission check on a new endpoint is a compile-time-adjacent failure, not a runtime surprise.
