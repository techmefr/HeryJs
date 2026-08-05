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

The `team` preset resolves against a `teamId` column, which the generator adds for you as soon as any preset asks for it — a blueprint must *not* declare `teamId` itself, since it is a reserved column the framework decides. Team memberships are resolved from the database on every request, so `team` is fully working; see [Teams](/guides/teams/) for how the perimeter is established.

## Two levels: collection and record

- **Collection-level** (`resolveCollectionCapability`) answers questions like "can this user create a BlogPost at all," where there is no specific record to check against yet.
- **Record-level** (`resolveCapability`) answers "can this user update *this* BlogPost," given the record.

## The subject

Every decision is taken against a `CapabilitySubject` — the caller reduced to what a preset needs to know:

```ts
export interface CapabilitySubject {
  id: string;
  teamIds: string[];
  currentTeamId: string | null;
  role: string;
}
```

One function builds it, `subjectOf(user)`, and `pnpm lint:subject` fails the build on any hand-written `teamIds:` literal outside the two files allowed to assemble one. That check exists because the alternative was tried: with every call site writing its own literal, `teamIds` stayed hardcoded to `[]` in thirteen places, and the `team` preset therefore denied everyone — a permission model that answered "no" to everything instead of failing loudly.

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
export const canUpdateBlogPost: PolicyCheck<BlogPostRecordLike> = (subject, record) =>
  record ? resolveCapability('own', subject, record) : { allowed: false };
```

```ts
@Patch(':id')
@Capability(canUpdateBlogPost)
@LoadRecordWith(BLOG_POST_RECORD_LOADER)
async update(@Req() req: RequestWithBlogPost, @Body() body: UpdateBlogPostInput) {
  return ok(await this.blogPosts.update(req.record, body));
}
```

`CapabilitiesGuard` reads the `@Capability` metadata via `Reflector`, loads the record through the `RecordLoader` named in `@LoadRecordWith` (if any), attaches it to the request, and calls the policy function. A `CapabilityForbiddenException` becomes a real HTTP 403 — not a silently filtered list.

Policy functions are plain functions rather than injected class methods on purpose: a decorator is evaluated at import time, before Nest's dependency injection has run, so anything it references has to already exist independently of the DI container.

Being plain functions has a second payoff. `CapabilitiesGuard` only works for HTTP — it reaches for the request through `switchToHttp()`. A GraphQL resolver, a WebSocket event handler and an MCP tool call cannot use the guard, but they can all call `canUpdateBlogPost(subject, record)` directly, which is exactly what they do. One set of rules, several protocols, no second permission model.

## Enforced in CI

Generated code belongs to you, which means the generator's guarantees stop the moment you edit it. Three scripts hold the line instead:

- `pnpm lint:capabilities` fails the build if any route under `functional/**/*.controller.ts` — reads included, not just `@Post`/`@Patch`/`@Put`/`@Delete` — is missing a `@Capability(...)`. `CapabilitiesGuard` returns `true` when the metadata is absent, so an undecorated read hands out every row its query returns.
- `pnpm lint:scope-parity` fails the build if a `search()` method under `functional/**/*.service.ts` does not go through `scopeWhereFor(...)`, which is how a collection query silently loses its scope.
- `pnpm lint:subject` fails the build if a capability subject is assembled anywhere but `subjectOf`, which is how a field on the subject silently stays empty.

Forgetting any of them is a build failure, not a runtime surprise. Each one exists because the corresponding mistake was made at least once, and none of them is detectable by reading the code that contains it — the bug is always an *absence*.
