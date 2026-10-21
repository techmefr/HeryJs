---
title: Testing conventions
description: What the generated spec proves over real HTTP, and why nothing in it is mocked.
---

Every resource `hery generate` writes comes with a spec, and `src/architecture.spec.ts` makes that non-negotiable: a folder in `functional/` without a `.spec.ts` fails the suite. A generated resource that nobody has tested is not a state the project allows.

## Real app, real database, real tokens

The generated spec boots the actual application and talks to it over HTTP:

```ts
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
app = moduleRef.createNestApplication();
await app.init();
```

Nothing is mocked. No `overrideProvider`, no in-memory database, no stubbed auth. `AppModule` starts for real, against real Postgres, and requests go through supertest against `app.getHttpServer()`.

That is a deliberate cost. The properties these specs exist to prove — a tenant boundary, a capability decision, a 403 that is genuinely a 403 — are properties of the _whole pipeline_: middleware, guard, record loader, policy, Prisma extension. A test that mocks the guard proves the mock works. Tenant isolation in particular is only meaningful end to end, because the thing being tested is that no layer forgot to apply it.

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
2. **Describes its fields and create/update rules for a frontend to consume** — the `/describe` route reports the same fields and required list the blueprint declares, plus whether the resource has a bin and which relations it can attach to.
3. **Scope parity** — see below.
4. **Trash parity** — see below.
5. **Resolves the capabilities the request named** — a search body carrying `capabilities: ['update', ...]` gets each row and `meta` back with the resolved `{ allowed, scope }` decisions, not a plain boolean. Beyond `update` and `delete`, a row also resolves `restore` on a resource with a bin and an `attach` and `detach` decision per relation, and `meta.capabilities` carries `create`, plus `hardDelete` and `listTrashed` on a resource with a bin.
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

Cases that depend on a write disappear when the blueprint's presets make them unreachable — `create`/`update`/`delete: none` skips the setup they need. Cases 11 and 12 only appear when the blueprint declares pagination, 13-14 only when it declares an include or an aggregate, 15-16 only when it has a visible string field to search on, and 17 only when it declares a mutable relation. Case 9 is the one that steps outside the pipeline. It calls `actingAs(app, { tenantId })`, which registers a user and then reassigns it through the unscoped client the auth layer owns, because reassigning a user's tenant is exactly the operation the tenant-scoped client is built to prevent. Setting up an adversarial condition requires stepping outside the thing being tested, and the helper is where that happens once.

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

## Test support

Everything a hand-written test usually rebuilds lives behind one import:

```ts
import { bootTestApp } from '#devtools/test-support';
```

`bootTestApp()` boots `AppModule` with the fakes you name and hands back the app, the fakes, and a `close()` that undoes everything it installed:

```ts
const testApp = await bootTestApp({ isolation: 'tenant' });
const admin = await testApp.actingAs({ role: 'admin' });

await request(testApp.app.getHttpServer())
  .post('/invoices/create')
  .set('Authorization', admin.authorization)
  .send({ data: [{ amount: 100 }] })
  .expect(201);

await testApp.fakes.mail.waitForSent(message => message.subject === 'Invoice');
```

### The fakes

Each fake records what reached it and asserts in one line. A failed assertion lists what was recorded, so the failure says what happened instead of only that nothing matched.

| Fake | Replaces | Assertions |
| --- | --- | --- |
| `fakes.mail` | the mail driver | `assertSent`, `assertNotSent`, `assertNothingSent`, `waitForSent` |
| `fakes.sms` | the sms driver | the same four |
| `fakes.push` | the push driver | the same four, plus `outcome` to simulate an expired or failed token |
| `fakes.storage` | the storage driver | `assertStored`, `assertNotStored`, `assertRemoved`; objects are held in memory |
| `fakes.notifier` | the notifier's mail, sms and push channels | `assertSent`, `assertNotSent`, `assertNothingSent` |
| `fakes.jobs` | `JobsService` | `assertDispatched(name, predicate?, times?)`, `assertNotDispatched`, `assertNothingDispatched` |
| `fakes.events` | `EventDispatcher` | `assertDispatched(EventClass, predicate?, times?)`, `assertNotDispatched`; `callThrough()` runs the synchronous listeners |
| `fakes.locks` | `LockService` | `assertAcquired`, `assertContended`, `assertReleased`; `hold(name)` simulates another instance holding it |
| `fakes.clock` | `Date` | `freeze(at)`, `set(at)`, `travel(ms)`, `restore()` |

By default `bootTestApp` fakes the four delivery drivers, so a test can never send a real mail or SMS by accident. Pass `fakes: ['mail', 'jobs']`, `'all'` or `'none'` to choose.

The delivery fakes are real drivers registered through the same module-and-driver convention a package driver uses. The real `MailService`, the SMS consent and quiet-hours guard, the push token registry and the queue all still run; only the wire is replaced. That is also why mail arrives asynchronously: the worker is real, so use `await fakes.mail.waitForSent(...)` rather than a synchronous assertion.

Fake the queue when you only care that work was scheduled. `fakes.jobs` stops every dispatch at the recorder, which means `mail.send` is recorded as a job and nothing reaches `fakes.mail`; assert on `fakes.jobs.assertDispatched('mail.send', ...)` in that mode. Faking events works the same way: listeners do not run unless you call `callThrough()`.

`fakes.clock` fakes `Date` only. Timers, `setImmediate` and `process.nextTick` stay real so the database driver and the queue keep working while time is frozen. Postgres `now()` and Redis expiry run on their own clocks and are not affected.

Outside `bootTestApp`, `createTestFakes()` builds the same objects for a unit test, and every fake has a `reset()`.

### Acting as someone

```ts
const owner = await testApp.actingAs();
const admin = await testApp.actingAs({ role: 'admin' });
const outsider = await actingAs(testApp.app, { tenantId: 'tenant-b' });
const robot = await testApp.actingAsApiKey({ role: 'admin' });
```

An actor carries `id`, `email`, `token`, `tenantId`, `role` and a ready `authorization` header value. `actingAsApiKey` creates the key through the real `/api-keys` route, so the token it returns is a genuine `hery_ak_` key and the request goes through the same credential resolution a client would. `asActor(request, actor)` sets the header on a supertest request.

### Isolation

`isolation: 'tenant'` gives the suite a tenant of its own. Actors default to it, `testApp.tenantId` names it, and `close()` deletes every row it wrote from every table that has a `tenantId` column. It is the idiom from the section below with the cleanup done for you.

For an in-process test that talks to Prisma directly rather than over HTTP, `inRolledBackTransaction(client, async tx => { ... })` runs the work in a transaction and rolls it back afterwards, returning whatever the work returned. It cannot isolate a request that goes over HTTP, for the reason given below.

There is no per-worker database. Each query path builds its adapter from `DATABASE_URL` when it is imported, so the tenant is the isolation boundary the suite relies on.

## Running them

```bash
pnpm test              # the whole suite, including architecture.spec.ts
pnpm test:cov          # with coverage
```

Specs need a reachable Postgres, since nothing is mocked. `pnpm hery up` checks that before you find out from a failure.

## Isolating a test you wrote yourself

The generated specs accumulate records on purpose, and that is fine for them:
they assert against ids they created, never against a total.

A test you write by hand often wants the opposite — count the rows, assert an
empty list, check that exactly one notification went out. The idiom for that
here is a tenant of its own rather than a transaction rolled back:

```ts
const tenantId = `test-${randomUUID()}`;

await TenantContextStorage.run({ tenantId }, async () => {
  // Every scoped query inside this block sees only what this block wrote.
});
```

A fresh tenant id gives real isolation at the boundary the framework already
enforces on every query, with no cleanup and no ordering between tests.

**A transaction rolled back after each test does not work here**, which is why
it is not the advice: a request goes over real HTTP into the running
application, so the transaction a test opened is not the one the handler uses.
That is the same choice the generated specs make, seen from the other side.

Where a test genuinely needs the rows gone afterwards — a unique constraint, a
fixture too large to leave behind — delete them by the tenant id in an
`afterAll`, through the raw client. It is the one place bypassing the scoped
client is right: cleaning up is not a tenant-scoped operation.

Note there is no per-test database reset. Records accumulate across runs, which is why every assertion is written against ids and users the test itself created rather than against a total count.
