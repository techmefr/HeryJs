---
title: Developer tooling
description: The request inspector, the scheduler, and the interactive console — what each one records, and what each one deliberately does not do.
---

Three tools that exist to answer "what did the app just do", "did that task run", and "what does this query actually return". They live in `devtools/` and `technical/`, they are always present, and none of them needs configuration.

## The request inspector

Every HTTP request the app handles is recorded in memory and readable over one route.

```
GET /inspector/requests
```

Each entry is small on purpose:

```ts
export interface InspectedRequest {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  tenantId?: string;
  timestamp: string;
}
```

That is the whole record. **Request bodies, headers, query strings and cookies are never captured** — not captured-and-redacted, simply never read. It is why the inspector needs no redaction configuration and no allow-list of sensitive fields: there is nothing in the store that was not already in the access log.

The trade-off is deliberate. This is not Laravel's Telescope: there is one entry kind, not a dozen watchers over queries, jobs, mail and exceptions.

### It sees requests the handler never did

The inspector is Express middleware recording on the response's `finish` event, not an interceptor. That placement is what lets it capture requests that never reached a handler — a 401 rejected by a guard, a 404 that matched no route, a validation 400. An interceptor would only ever see the successful path.

It also sits *after* `TenantMiddleware` in the chain, which is why `tenantId` is populated at all. An unauthenticated request records the literal `unauthenticated`, which is the value the tenant middleware assigns rather than a missing field.

### In-memory, capped, and lost on restart

A 200-entry ring buffer, newest first, per process. No database, no Redis, no file. The cap is a module constant, not a setting — raising it is an edit in `inspector.store.ts`, which you own.

Two consequences: an app restart wipes the history, and with multiple instances behind a load balancer each one only knows about its own requests.

### Dev-only, with a caveat worth knowing

The read route is guarded by `SessionGuard` and `DevOnlyGuard`, so it needs a session and it 404s when `NODE_ENV=production`. The guard order matters: `SessionGuard` runs first, so an *unauthenticated* production call gets a 401 rather than the 404 that would suggest the route does not exist. Authenticated production calls do get the 404.

Note that only the *route* is gated. The middleware records unconditionally, in every environment.

## The scheduler

HeryJs does not wrap `@nestjs/schedule` — it uses it, and adds one thing: a record of what actually ran.

A task is a plain provider using the Nest decorators, whose body delegates to `ScheduledTaskStore.run()`:

```ts
@Injectable()
export class HeartbeatTask {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'heartbeat' })
  async run(): Promise<void> {
    await this.store.run('heartbeat', () => undefined);
  }
}
```

Add the class to a module's `providers` and it is live. There is no `@ScheduledTask` decorator of our own, no task registry, no auto-discovery of `*.task.ts` — the convention is where the record-keeping goes, not a layer over the scheduling itself. Passing `{ name: 'heartbeat' }` is what makes the job addressable later, including from a test.

`store.run(name, fn)` times the callback and stores the outcome:

```ts
export interface ScheduledTaskRun {
  name: string;
  lastRunAt: string;
  durationMs: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}
```

Readable at `GET /scheduler/tasks`, behind the same `SessionGuard` + `DevOnlyGuard` pair as the inspector.

`run()` **swallows the error**: a throwing task is recorded as `failed` with its message, and the promise resolves normally. An unhandled rejection inside a cron callback is a bad way to find out a task is broken; a `failed` row is a better one.

### What the scheduler does not do

Worth being explicit, because each of these is something a reader may assume:

- **No history.** The store is a `Map` keyed by task name, so only the most recent run of each task survives. A task that has never fired does not appear in the list at all — it lists runs, not declarations.
- **No persistence.** In-memory, per process, gone on restart.
- **No overlap prevention and no locking.** A slow task can overlap its next tick, and with several app instances every instance runs every cron independently. Distributed scheduling is not solved here.
- **No retries or backoff.** For work that needs those, reach for the BullMQ-based jobs layer instead.
- **No trigger route and no CLI command.** Nothing lets you fire a task by hand over HTTP.

### Tasks are not tenant-aware

This is the one that bites. A cron callback runs outside any request, so there is no ambient tenant context — and the tenant-scoped Prisma client *requires* one. Touching a tenant-scoped model from a task without establishing that context throws.

A task that spans tenants has to say which tenant each piece of work belongs to, which is what `runInTenant` is for — the kernel's one entry point for work with no request behind it:

```ts
await this.store.run('digest', async () => {
  for (const tenantId of await this.tenants.all()) {
    await runInTenant(tenantId, async () => {
      // tenant-scoped queries are safe in here
    });
  }
});
```

There is deliberately no helper that loops tenants for you: "run this for every tenant" is a decision with real consequences, and it should be visible in the code that made it.

## The interactive console

```bash
pnpm hery console
pnpm hery console --tenant acme
```

Boots the real application — the full DI container, Prisma, auth, jobs — and drops you at a prompt. No HTTP server is started; this is `NestFactory.createApplicationContext`, not a running app.

```
hery> await prisma.blogPost.findMany()
```

Three bindings are pre-loaded, and that is all:

| | |
|---|---|
| `app` | the Nest application context |
| `prisma` | the tenant-scoped Prisma client |
| `get(token)` | resolve any provider by its token |

`get` is the useful one — anything in the container is reachable:

```
hery> const blogPosts = get(BlogPostService)
```

### The whole session runs inside a tenant

The REPL starts *inside* `TenantContextStorage.run({ tenantId })`, which is what makes the scoped `prisma` client work outside a request. `--tenant` picks which one, defaulting to `default`. Queries you type are filtered and stamped exactly as they would be in a request for that tenant — including the surprise that a record you just created is invisible from a console pointed at a different tenant.

**There is no team context.** No current team, no capability subject. Anything that resolves a capability needs a subject you build yourself at the prompt — and per the rule that there is only one place a subject is built, that means calling `subjectOf` on a user you loaded, not writing the object literal.

Exiting (`.exit` or Ctrl-D) closes the Nest context and exits cleanly. Note that REPL history is not persisted between sessions, and top-level `await` is whatever the underlying Node REPL provides rather than something the framework adds.
