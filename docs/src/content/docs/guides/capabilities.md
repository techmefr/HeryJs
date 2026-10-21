---
title: Capabilities
description: How HeryJs resolves permissions, and why the server never sends rules to the client.
---

A capability is a resolved decision, not a rule: `{ allowed: boolean, scope?: 'own' | 'team' | 'all' }`. The server never sends a permission _rule_ to the client — only the outcome of evaluating one, for the current user, against an already-loaded record.

## Presets

Every permission in a blueprint picks one of four presets:

- `own` — allowed if the current user owns the record.
- `team` — allowed if the record belongs to one of the user's teams.
- `all` — always allowed.
- `none` — never allowed.

Resolution happens **in memory**, against a record already fetched for the request — never as a separate query per item. This is what keeps a list endpoint from turning into an N+1 permission check.

The `team` preset resolves against a `teamId` column, which the generator adds for you as soon as any preset asks for it — a blueprint must _not_ declare `teamId` itself, since it is a reserved column the framework decides. Team memberships are resolved from the database on every request, so `team` is fully working; see [Teams](../guides/teams/) for how the perimeter is established.

## Two levels: collection and record

- **Collection-level** (`resolveCollectionCapability`) answers questions like "can this user create a BlogPost at all," where there is no specific record to check against yet.
- **Record-level** (`resolveCapability`) answers "can this user update _this_ BlogPost," given the record.

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
export function scopeWhereFor(
  preset: PermissionPreset,
  subject: CapabilitySubject,
): ScopeWhere {
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

"Fed the same preset" is not a figure of speech: `hery generate` writes the four presets into one object and every call site reads it.

```ts
// blog-post.presets.ts
export const BLOG_POST_PRESETS = {
  view: 'own',
  create: 'own',
  update: 'own',
  delete: 'own',
} as const satisfies Record<
  'view' | 'create' | 'update' | 'delete',
  PermissionPreset
>;
```

```ts
// blog-post.policy.ts
export const canViewBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) =>
  record
    ? resolveCapability(BLOG_POST_PRESETS.view, subject, record)
    : { allowed: false };
```

There is one declaration, so tightening a permission is a one-line edit and there is no second place to forget. `pnpm lint:scope-parity` fails the build on any call that passes a literal instead — that literal is the second declaration coming back.

The generated `search()` merges the scope clause in its own `AND` branch:

```ts
where: {
  AND: [
    scopeWhereFor(BLOG_POST_PRESETS.view, subject),
    trashedWhere,
    { ...options.filters, ...searchWhere },
  ],
}
```

Its own branch, not a spread, so a declared filter can never widen it back — whatever the caller puts in the query string.

Listing soft-deleted rows follows the `delete` preset instead of the read one (`canListTrashedX`), on the grounds that opening the bin is a moderation move. The rows that come back are still narrowed by the view scope: the gate answers "may I look at the bin", the scope answers "which rows I may see".

## Sharing one record

Presets answer "whose records". Sharing answers "this one record, for this person": the owner grants a user or a team read or write access to a single record, and the same capability engine resolves it. It is off by default; declare it in the blueprint:

```yaml
sharing: true
```

The resource then gains three routes, all behind the `share` capability (the `update` preset, evaluated without the shares, so only the owner or whoever the preset names can share, and a user who was handed write access cannot hand it on):

| Route                              | What it does                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| `POST /<resource>/:id/shares/search` | Lists who the record is shared with.                                |
| `POST /<resource>/:id/shares`        | Grants `{ granteeType: user \| team, granteeId, access: read \| write }`. Granting again changes the access. |
| `DELETE /<resource>/:id/shares/:shareId` | Revokes one share.                                              |

A `read` share lets the grantee see the record, in the list as well as on the detail route. A `write` share also lets them update it, and attach or detach its relations. Deleting is never shareable, and a preset of `none` stays closed: a share extends a perimeter, it does not reopen a closed one. A decision allowed by a share reports `scope: shared`.

### It still resolves in memory

Nothing queries per row:

- A collection search fetches the ids shared with the caller once (directly or through any of its teams) and folds them into the scope filter: `scopeWhereFor(preset, subject, sharedIds)` returns `{ OR: [presetScope, { id: { in: sharedIds } }] }`. The same filter feeds the list and the count.
- A record loaded for a detail or bulk route carries its shares (one query for the record, one for its shares), and a page of search results fetches the shares of all its rows in one query. `resolveCapability(preset, subject, record, read | write)` then decides from what is already on the record.

The ids set is bounded (5000 most recent shares per resource and caller); a caller with more still reaches every shared record by id.

### Tenant isolation is untouched

`RecordShare` carries a `tenantId`, goes through the tenant-scoped Prisma client and has its own row-level security policy. A grantee has to exist in the caller's tenant: a user or team of another tenant is refused with a 404 rather than stored as an inert row.

### Auditable

`RecordShare` is an audited model: every grant and revoke is written to the hash-chained audit log with the acting user (and the impersonator, if any). Each row also records who granted it and when.

### From the admin

The resource page shows a Share button on a row where the `share` decision is allowed. It opens a dialog listing the shares with a revoke on each, and a form to grant a user (by id) or one of your teams read or write access.

### Limits

- A resource with `view: team` and a caller in no team is refused by the collection capability before shares are looked at; that caller still reaches shared records by id.
- Sharing cannot be combined with a `vector` field yet: similarity ranking runs in SQL against the view scope.
- The GraphQL resolver and MCP tools of a resource apply shares to the list scope, but their per-row capability reports do not carry them.

## `@Capability` and `CapabilitiesGuard`

A controller route declares its policy as a plain, exported function — not a class method:

```ts
export const canUpdateBlogPost: PolicyCheck<BlogPostRecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('own', subject, record) : { allowed: false });
```

```ts
@Post('update')
@Capability(canUpdateAnyBlogPost)
async update(@Req() req: RequestWithUser, @Body() body: UpdateBlogPostRequestBody) {
  const subject = subjectOf(req.user);
  const loaded = await this.loadAndAuthorize(
    body.data.map((item) => item.id),
    subject,
    (s, record) => canUpdateBlogPost(s, record),
  );
  // one result per entry, each with its own status
}
```

`CapabilitiesGuard` reads the `@Capability` metadata via `Reflector`, loads the record through the `RecordLoader` named in `@LoadRecordWith` (if any), attaches it to the request, and calls the policy function. A `CapabilityForbiddenException` becomes a real HTTP 403 — not a silently filtered list.

Every mutating route takes an array, so the two levels both have work to do: the guard resolves the collection-level function (`canUpdateAnyBlogPost`) before any record is read, and the handler then resolves the record-level one (`canUpdateBlogPost`) against each loaded row. A single refused entry comes back as an error in its own slot rather than failing the whole request.

Policy functions are plain functions rather than injected class methods on purpose: a decorator is evaluated at import time, before Nest's dependency injection has run, so anything it references has to already exist independently of the DI container.

Being plain functions has a second payoff. `CapabilitiesGuard` only works for HTTP — it reaches for the request through `switchToHttp()`. A GraphQL resolver, a WebSocket event handler and an MCP tool call cannot use the guard, but they can all call `canUpdateBlogPost(subject, record)` directly, which is exactly what they do. One set of rules, several protocols, no second permission model.

## The routes that cannot carry a capability

A few routes have no caller to resolve a decision against. Logging in and registering are what _create_ the caller. A signed storage URL is handed to a browser as an `<img src>` and carries no session — the HMAC signature and the expiry in the query string are the credential. An inbound webhook is sent by a third-party service that signs the raw body with the endpoint secret. Each of those is gated, just not by a capability: a guard checks the credential the request actually carries, and the route says so out loud:

```ts
@Post(':endpointId')
@UseGuards(WebhookSignatureGuard)
@PublicRoute('inbound webhook: the sender has no session, it signs the raw body with the endpoint secret')
async receive(@Req() req: RequestWithWebhookEndpoint) { … }
```

`@PublicRoute` sets no behaviour — `CapabilitiesGuard` already lets a route through when no capability metadata is present. That is exactly the problem it solves: without it, "this route needs no capability" and "someone forgot the capability" are the same thing to the guard, and to a reader. The decorator makes the first an explicit, greppable statement, with its reason written where the route is rather than in a list somewhere else that quietly stops matching.

Everything else carries a capability, including the routes that are not resources: `/health` and `/metrics` report the database and the queue by name and quote their failures verbatim, so they are caller-authenticated like any other route. A container or cluster probe and a Prometheus scrape have no session, so they authenticate with an API key — the credential this framework already ships for non-interactive callers — in the usual `Authorization: Bearer` header.

## A capability that is not about a resource

Opening the metrics page, running a prune, seeding an agency, reading the audit
log: each answers "may this caller do this at all", never "on whose rows". They
receive no record, and their scope is a property of the capability rather than
of the row.

They are written with `ability`, not by hand:

```ts
export const canManagePrune: PolicyCheck = adminAbility;

export const canManageTeamMembers: PolicyCheck = ability(
  (subject) => subject.teamIds.length > 0,
  'team',
);
```

This is the same `PolicyCheck` a generated resource policy uses — naming the
shape, not adding a second authorization system. It exists because eleven of
these had been written by hand across the kernel and its modules, **nine of
them the identical admin-or-nothing ternary**. That is the repetition that
drifts: one copy eventually grows an extra condition, and nothing says whether
that was deliberate or a mistake.

`adminAbility` covers the common case, and reads as one decision — "trusted
with something tenant scoping cannot contain" — everywhere it is made.
`everyone(scope)` covers a perimeter every signed-in caller is inside of, where
what remains is whose rows rather than whether.

A refusal carries no scope. A decision that is both denied and scoped invites a
caller to read the scope and act on it, which is how a "no" quietly becomes a
narrower "yes".

## Enforced in CI

Generated code belongs to you, which means the generator's guarantees stop the moment you edit it. Three scripts hold the line instead:

- `pnpm lint:capabilities` fails the build if any route in the repository — every `*.controller.ts` under `src/`, `examples/` and `packages/`, reads included, not just `@Post`/`@Patch`/`@Put`/`@Delete` — carries neither a `@Capability(...)` nor a `@PublicRoute('<reason>')`. `CapabilitiesGuard` returns `true` when the metadata is absent, so an undecorated read hands out every row its query returns. Kernel, module and devtools routes are held to this too: they serve data exactly like a resource route does.
- `pnpm lint:scope-parity` fails the build if a `search()` under `functional/**/*.service.ts` does not go through `scopeWhereFor(...)`, which is how a collection query silently loses its scope — and, in every service and policy it scans, if any call to `scopeWhereFor`, `resolveCapability`, `resolveCollectionCapability` or `CapabilitiesService.resolve` passes a preset literal instead of reading the resource's `<NAME>_PRESETS` entry. Detecting the call was not enough: two calls can both be present and disagree.
- `pnpm lint:subject` fails the build if a capability subject is assembled anywhere but `subjectOf`, which is how a field on the subject silently stays empty.

Forgetting any of them is a build failure, not a runtime surprise. Each one exists because the corresponding mistake was made at least once, and none of them is detectable by reading the code that contains it — the bug is always an _absence_.
