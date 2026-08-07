---
title: Testing conventions
description: What the generated spec proves over real HTTP, and why nothing in it is mocked.
---

Every resource `hery generate` writes comes with a spec, and `src/architecture.spec.ts` makes that non-negotiable: a folder in `functional/` without a `.spec.ts` fails the suite. A generated resource that nobody has tested is not a state the project allows.

## Real app, real database, real tokens

The generated spec boots the actual application and talks to it over HTTP:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
app = moduleRef.createNestApplication();
await app.init();
```

Nothing is mocked. No `overrideProvider`, no in-memory database, no stubbed auth. `AppModule` starts for real, against real Postgres, and requests go through supertest against `app.getHttpServer()`.

That is a deliberate cost. The properties these specs exist to prove — a tenant boundary, a capability decision, a 403 that is genuinely a 403 — are properties of the *whole pipeline*: middleware, guard, record loader, policy, Prisma extension. A test that mocks the guard proves the mock works. Tenant isolation in particular is only meaningful end to end, because the thing being tested is that no layer forgot to apply it.

Sessions are real too. `registerAndLogin` from `devtools/testing` registers a user with a random email, logs in, and hands back the token:

```ts
export interface TestUser {
  id: string;
  email: string;
  token: string;
}
```

Requests then carry it the way a client would:

```ts
.set('Authorization', `Bearer ${ownerToken}`)
```

A fresh random email per call is also what keeps specs isolated: there is no truncate step and no global setup, so tests do not collide because they never share a user.

## What the generated spec asserts

Seventeen cases for the default permission presets, with two users — an owner and a stranger. Request bodies are built from the blueprint's required fields with sample values, so the spec compiles and runs against whatever fields you declared.

1. **Creates a record owned by the current user, scoped to the current tenant** — asserts the created record's `tenantId`, proving the boundary is stamped without the caller mentioning it.
2. **Describes its fields and create/update rules for a frontend to consume** — the `/describe` route reports the same fields and required list the blueprint declares.
3. **Scope parity** — see below.
4. **Trash parity** — see below.
5. **Resolves the capabilities the request named** — a search body carrying `capabilities: ['update']` gets each row and `meta` back with the resolved `{ allowed, scope }` decisions, not a plain boolean.
6. **Returns a real 403 when someone other than the owner tries to update it** — the stranger gets a 403, not a silently filtered response.
7. **Soft-deletes then restores a record** — delete, confirm a read no longer finds it, restore, confirm it is back. The gap in the middle is the interesting assertion: a trashed record must not resurface through a plain read.
8. **Refuses to restore a record that is not trashed** — restoring a live row is an error, not a no-op that reports success.
9. **Never lets a different tenant see this tenant's records** — moves a user into another tenant directly in the database, then confirms the search route answers with zero rows.
10. **Cannot be spoofed into another tenant via a client-supplied header** — a `x-tenant-id` header is ignored rather than honoured, since the tenant is resolved from the session, not a header.
11. **Reports pagination meta alongside the results** — `page`, `limit`, `total` and `last_page`, for a blueprint that declared pagination.
12. **Rejects a page size the blueprint did not declare** — a 400 against the declared `limits`, not a silent clamp.
13. **Rejects an include naming a relation this resource does not declare.**
14. **Rejects an aggregate naming a relation this resource does not declare.**
15. **Finds a record by text search through the explicitly named default engine.**
16. **Rejects a search engine keyword `hery.config.ts` never declared** — a 400, not a silent fallback.
17. **Attaches, syncs and detaches a relation through the update route** — one case per mutable relation the blueprint declares.

Cases that depend on a write disappear when the blueprint's presets make them unreachable — `create`/`update`/`delete: none` skips the setup they need. Cases 11 and 12 only appear when the blueprint declares pagination, 13-14 only when it declares an include or an aggregate, 15-16 only when it has a visible string field to search on, and 17 only when it declares a mutable relation. Case 9 is the one that needs the raw client. The spec opens its own unextended `PrismaClient`, deliberately *not* the tenant-scoped one, because reassigning a user's tenant is exactly the operation the scoped client is built to prevent. Setting up an adversarial condition requires stepping outside the thing being tested.

### The scope-parity and trash-parity cases adapt to the blueprint

Case 3 is generated in one of three forms, chosen by the resource's `view` preset, because the correct assertion differs:

- `view: own` or `team` → **keeps a record out of the list for anyone who cannot open it directly.** The stranger gets a 403 on the detail route, and the record's id is absent from the stranger's search results.
- `view: all` → **lists a record to anyone who can also open it directly.** The stranger gets a 200 on both.
- `view: none` → **refuses the collection route outright, matching the view preset.**

Case 4 follows the same shape, but branches on the `delete` preset instead, since `canListTrashed<Name>` follows delete, not view:

- `delete: own` or `team` → **keeps a trashed record out of the bin of anyone who cannot open it.** The stranger gets a 200 on `{ onlyTrashed: true }`, with the record's id absent.
- `delete: all` → **lists a trashed record to anyone who can also list the trash.** The stranger gets a 200 with the record's id present.
- `delete: none` → **refuses to list the trash outright, matching the delete preset.**

All six assert the same underlying property from whichever side applies: the detail route and the search route agree on who may see a record, live or trashed. That is the failure mode the capabilities design exists to make unwriteable, and this is where it stops being an argument and becomes a test.

## Extending it

The generated spec is a floor, not a ceiling — it is written once and then owned, like everything else. The reference resource in `examples/blog-post/` shows what a filled-out version looks like.

A factory is generated alongside the spec (`<name>.factory.ts`, faker-backed, with a `trashed` override and a `count` option) for seeding rows directly. The generated spec does not use it, going through HTTP instead — reach for the factory when you need a hundred rows or an awkward state, not for the paths a client would exercise.

## Running them

```bash
pnpm test              # the whole suite, including architecture.spec.ts
pnpm test:cov          # with coverage
```

Specs need a reachable Postgres, since nothing is mocked. `pnpm hery up` checks that before you find out from a failure.

Note there is no per-test database reset. Records accumulate across runs, which is why every assertion is written against ids and users the test itself created rather than against a total count.
