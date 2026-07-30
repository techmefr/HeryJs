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

Five cases, with two users — an owner and a stranger. Request bodies are built from the blueprint's required fields with sample values, so the spec compiles and runs against whatever fields you declared.

1. **Creates a record owned by the current user, scoped to the current tenant** — asserts the created record's `tenantId`, proving the boundary is stamped without the caller mentioning it.
2. **Returns a real 403 when someone other than the owner tries to update it** — the stranger gets a 403, not a silently filtered response.
3. **Soft-deletes then restores a record** — delete, confirm the detail route now 404s, restore, confirm it is readable again. The 404 in the middle is the interesting assertion: a trashed record must not resurface through a plain read.
4. **Scope parity** — see below.
5. **Never lets a different tenant see this tenant's records** — moves a user into another tenant directly in the database, then confirms the collection route answers with zero rows.

Case 5 is the one that needs the raw client. The spec opens its own unextended `PrismaClient`, deliberately *not* the tenant-scoped one, because reassigning a user's tenant is exactly the operation the scoped client is built to prevent. Setting up an adversarial condition requires stepping outside the thing being tested.

### The scope-parity case adapts to the blueprint

Case 4 is generated in one of three forms, chosen by the resource's `view` preset, because the correct assertion differs:

- `view: own` or `team` → **keeps a record out of the list for anyone who cannot open it directly.** The stranger gets a 403 on the detail route, and the record's id is absent from the stranger's list.
- `view: all` → **lists a record to anyone who can also open it directly.** The stranger gets a 200 on both.
- `view: none` → **refuses the collection route outright, matching the view preset.**

All three assert the same underlying property from whichever side applies: the detail route and the list route agree. That is the failure mode the capabilities design exists to make unwriteable, and this is where it stops being an argument and becomes a test.

## Extending it

The generated spec is a floor, not a ceiling — it is written once and then owned, like everything else. The reference resource in `examples/workout/` shows what a filled-out version looks like, with cases the generator does not write:

- listing the bin (`?onlyTrashed=true`) is refused to someone who cannot open the records in it;
- `?include=capabilities` returns resolved decisions on each row and in `meta`;
- a client-supplied `x-tenant-id` header is ignored rather than honoured.

That last one is worth copying into any project that adds its own middleware. The tenant is resolved from the session; a test that proves a header cannot override it is cheap insurance against a future refactor that adds a convenience override.

A factory is generated alongside the spec (`<name>.factory.ts`, faker-backed, with a `trashed` override and a `count` option) for seeding rows directly. The generated spec does not use it, going through HTTP instead — reach for the factory when you need a hundred rows or an awkward state, not for the paths a client would exercise.

## Running them

```bash
pnpm test              # the whole suite, including architecture.spec.ts
pnpm test:cov          # with coverage
```

Specs need a reachable Postgres, since nothing is mocked. `pnpm hery up` checks that before you find out from a failure.

Note there is no per-test database reset. Records accumulate across runs, which is why every assertion is written against ids and users the test itself created rather than against a total count.
