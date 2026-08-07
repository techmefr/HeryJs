---
title: Teams
description: Team membership as a perimeter resolved from the database on every request, and the team permission preset that reads it.
---

A tenant is a boundary: it decides which rows exist at all for a request. A team is a *perimeter* inside that boundary: it decides which of those rows a member may touch. The two are enforced at different layers and neither substitutes for the other.

Teams are real infrastructure, not a convention you implement per project. There are Prisma models, HTTP routes, a session that resolves memberships, and a `team` permission preset that reads them.

## The data model

Three pieces in `prisma/schema.prisma`:

```prisma
model Team {
  id        String @id @default(cuid())
  tenantId  String @default("default")
  name      String
  members      TeamMember[]
  currentUsers User[] @relation("CurrentTeam")
}

model TeamMember {
  teamId   String
  userId   String
  tenantId String @default("default")
  @@id([teamId, userId])
}
```

and, on `User`, a nullable `currentTeamId` pointing at the team the caller is currently acting inside (`onDelete: SetNull`, so deleting a team does not leave users pointing at a row that no longer exists).

A user can belong to many teams. Exactly one of them is current at a time.

## Membership is resolved from the database, on every request

Everything the pipeline is allowed to trust about a caller is read server-side, in one place — `authenticate()` in `src/technical/auth/session-auth.provider.ts`:

```ts
const stored = await authPrismaClient.user.findUniqueOrThrow({
  where: { id: user.id },
  select: {
    tenantId: true,
    currentTeamId: true,
    role: true,
    memberships: { select: { teamId: true } },
  },
});

const teamIds = stored.memberships.map((membership) => membership.teamId);
```

That function is what `login()`, `register()` and `validateSession()` all return, and `validateSession()` runs on every authenticated request. So `teamIds` is never a claim carried in a token, never a header, never a field in a request body. It is a fresh read of the membership table.

This matters for revocation. Remove someone from a team and the very next request already reflects it — there is no token to wait out and no cache to invalidate.

### A stored current team is only honoured while the membership holds

The current team is persisted on the user row, which means the stored value can go stale — someone can be removed from the team they had selected. The session refuses to take it at face value:

```ts
currentTeamId:
  stored.currentTeamId && teamIds.includes(stored.currentTeamId)
    ? stored.currentTeamId
    : (teamIds[0] ?? null),
```

Two behaviours fall out of that single expression. A current team the caller has since been removed from stops granting anything, rather than quietly keeping a perimeter it no longer has. And a member who never picked a team still acts inside one — the first they belong to — instead of being stuck unable to create anything. A caller in no team at all gets `null`, which is a real state the code handles rather than an accident.

## `subjectOf` — the one place a subject is built

A capability decision is taken against a *subject*: the caller reduced to what a permission preset needs to know.

```ts
export interface CapabilitySubject {
  id: string;
  teamIds: string[];
  currentTeamId: string | null;
  role: string;
}
```

Every subject in the codebase comes from one function, `subjectOf(user)` in `src/technical/capabilities/subject.ts`:

```ts
export function subjectOf(user: AuthenticatedUser): CapabilitySubject {
  return {
    id: user.id,
    teamIds: user.teamIds,
    currentTeamId: user.currentTeamId,
    role: user.role,
  };
}
```

This looks like ceremony around an object literal, and it is not. When each call site wrote its own literal, `teamIds` was hardcoded to `[]` in thirteen places, and the `team` preset therefore denied everybody — a permission model that silently answered "no" to every question instead of failing loudly.

A single builder is only a real guarantee if nothing can go around it, so `pnpm lint:subject` (`scripts/check-subject-construction.ts`) walks every non-spec `.ts` file under `src/` and `cli/` and fails the build on a hand-written `teamIds:` property. Exactly two files are allow-listed: `subject.ts` itself, and `session-auth.provider.ts`, which assembles the session the subject derives from. Adding a fifth field to `CapabilitySubject` is now a one-file change instead of a hunt.

## The `team` preset

With memberships actually populated, `team` works like the other presets — resolved in memory, against a record already loaded for the request:

```ts
case 'team': {
  const allowed =
    record.teamId !== undefined && subject.teamIds.includes(record.teamId);
  return allowed ? { allowed, scope: 'team' } : { allowed };
}
```

At collection level, `team` is allowed only for a caller who belongs to at least one team — someone in none has nothing to list, and saying so up front is cheaper than running a query guaranteed to return nothing.

A resource opts in by picking the preset in its blueprint:

```yaml
name: Document
permissions:
  view: team
  create: team
  update: team
  delete: own
```

The generator treats a resource as team-owned as soon as *any* of its presets says `team`, and only then does the create path have a team to stamp.

## Reading spans every team; writing lands in the current one

Worth being explicit, because the two use different fields.

The collection filter is built from `teamIds` — all of them:

```ts
case 'team':
  return { teamId: { in: subject.teamIds } };
```

The create path uses `currentTeamId` — exactly one:

```ts
data: {
  ...data,
  ownerId: subject.id,
  // The team comes from the session, never from the request body, so a
  // caller cannot file a record into a team it does not belong to.
  teamId: subject.currentTeamId,
}
```

So a member of three teams reads across all three and writes into whichever one is current. Switching teams changes where new records land, not what is visible.

The `teamId` on a create is taken from the session and never from the payload, which is what makes "file this record into a team I am not in" unexpressible rather than merely rejected. It is also why `teamId` is a reserved blueprint field: declaring it would put a client-writable field on top of a column the framework decides, and `hery generate` refuses the blueprint outright.

### Creating without a current team is a 409

A team-owned record has nowhere to go if the caller is in no team. The generated `create()` says so before touching the database:

```ts
if (!subject.currentTeamId) {
  throw new NoCurrentTeamException();
}
```

```json
{
  "error": {
    "status": 409,
    "key": "team.noCurrentTeam",
    "message": "Join a team before creating records owned by one."
  }
}
```

409 rather than 403: nothing about the request is forbidden, and retrying it unchanged will succeed once the caller joins a team. That distinction is what lets a client tell "you may not do this" apart from "do this first".

## The list route and the detail route cannot disagree

The failure mode this design exists to prevent is quiet: a record that returns 403 on its detail route and is handed out in full by the list route. Nothing errors — the endpoint simply answers with data it should have withheld.

It cannot happen here because the collection filter and the per-record decision are derived from the *same* preset. The generated policy declares:

```ts
export const canViewDocument: PolicyCheck<DocumentRecordLike> = (subject, record) =>
  record ? resolveCapability('team', subject, record) : { allowed: false };

// Same preset as canViewDocument: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAnyDocument: PolicyCheck = (subject) =>
  resolveCollectionCapability('team', subject);
```

and the generated `search()` calls `scopeWhereFor` with that same `view` preset, baked in at generation time. `resolveCapability` and `scopeWhereFor` are mirror images reading the same two columns, `ownerId` and `teamId`. There is no second declaration to keep in sync, so there is nothing to forget.

The generated spec asserts it over real HTTP rather than trusting the argument — for a `view` preset of `own` or `team` it checks that a record a stranger gets a 403 on is also absent from that stranger's list.

## The HTTP surface

Four routes, all behind `SessionGuard` and `CapabilitiesGuard`, each carrying its own capability like any resource route. Every one reads membership from the session rather than from the body.

| Route | What it does |
|---|---|
| `GET /teams` | The caller's own teams, paged (`?page=&limit=`). `meta.currentTeamId` carries the current one, alongside the usual `page`/`limit`/`total`/`last_page`. |
| `POST /teams` | Creates a team, `{ name }`. |
| `POST /teams/:id/members` | Adds `{ userId }` to the team. |
| `PATCH /teams/current` | Switches the current team, `{ teamId }`. |

Both routes that name an existing team check membership first:

```ts
private assertMember(req: RequestWithUser, teamId: string): void {
  if (!req.user.teamIds.includes(teamId)) {
    throw new CapabilityForbiddenException({ allowed: false });
  }
}
```

Without it on `POST /teams/:id/members`, anyone could add themselves to any team and read every record that team owns. Without it on `PATCH /teams/current`, the same, by a different door.

**The creator joins the team it creates.** Otherwise it would own a perimeter it is not inside, and every team-scoped read would still deny it.

**Cross-tenant membership is refused, not merely inert.** `addMember` looks the team up through the tenant-scoped Prisma client, so a team in another tenant is simply not found. It then checks the invited user's `tenantId` against the team's. The tenant boundary already makes such a grant worthless, but it would still leave a row claiming a perimeter that cannot exist, so it is rejected outright.

**Roles and invitations are deliberately absent.** Who may rename a team, whether joining needs an invite, whether there is an owner distinct from a member — those are product decisions, not conventions. HeryJs gives you the perimeter and stays out of the policy you build on it.

## What the tests pin down

`src/technical/teams/teams.spec.ts` covers, over real HTTP: an unauthenticated caller is refused; a caller who never joined reports no team and a `null` current team; the creator ends up inside its own team; a member sees a team it was added to; an outsider adding itself gets a 403 and still sees nothing; an outsider cannot make someone else's team its current one; switching between two of its own works; and a current team the caller was removed from stops being honoured.
