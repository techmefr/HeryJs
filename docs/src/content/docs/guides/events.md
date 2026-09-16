---
title: The events bus
description: How one feature reacts to another without importing it — constructor-keyed events, sync or queued listeners, and a tenant that survives the queue.
---

The architecture rules forbid the obvious way to make one feature react to another. `.dependency-cruiser.cjs` refuses `functional/` → `functional/` and module → module imports outright, so calling the mailer from the registration service is not an option — that import is precisely the edge the rule exists to prevent.

The events bus is the seam that makes the rule livable. It sits in the kernel, `src/technical/events/`, which both sides may reach without either knowing the other exists.

```ts
imports: [EventsModule],
```

`EventsModule` is **not imported by `src/app.module.ts` today**, in this repository or in a freshly scaffolded project. Add it yourself before injecting `EventDispatcher`, or the injection fails at boot.

## An event is a class, and the class is the subscription key

```ts
export class UserRegistered {
  constructor(
    readonly userId: string,
    readonly email: string,
  ) {}
}
```

Not a string, and not a token declared beside it. **A string key makes a rename a silent no-op**: the dispatcher still accepts the old string, no listener matches it any more, and the feature that used to react simply stops reacting with no error anywhere. A token per event has the same failure in a slower form — the token and the payload type drift apart and nothing checks that the listener reads the shape the dispatcher wrote.

The constructor is the one key that cannot drift. `listen(UserRegistered, …)` ties the subscription, the payload type and the class name together, so renaming or deleting the event is a compile error at every listener rather than a dead subscription discovered in production.

## A listener is a name, a handler, and one flag

```ts
this.events.listen(UserRegistered, {
  name: 'SendWelcomeMail',
  isQueued: true,
  handle: async (event) => {
    await this.mail.send(new WelcomeMail(event.email));
  },
});
```

`name` is not a label. It is what a queued job carries to find this listener again in the worker process, so it is **stable data across deploys** — renaming it while jobs are already enqueued strands those jobs, and the worker drops them with a warning rather than retrying forever against code that no longer exists.

`isQueued` is the only thing that decides where the work runs, and moving a listener to the queue is a one-flag change with **no diff at any dispatch site**. That asymmetry is the whole point: a caller dispatches, and never learns whether anyone is listening, how many are, or which of them run in-process.

## Dispatching runs every listener, then reports every failure

```ts
await this.events.dispatch(new UserRegistered(user.id, user.email));
```

Synchronous listeners run in order, each in its own `try`. Failures are collected and rethrown together as an `AggregateError` naming the event and the count.

Both alternatives are worse, and the choice is deliberate. **Stopping at the first throw makes an unrelated listener's bug silently cancel the ones registered after it** — an ordering dependency nobody declared. Swallowing the throw is worse still: the listener that was supposed to send the welcome mail fails forever and the only trace is the mail that never arrives. So no listener is skipped because of another, each failure is logged where it happened, and the dispatch site still learns that something went wrong.

Queued listeners are outside that policy. Their failures belong to BullMQ, which retries them; enqueueing is all `dispatch()` awaits for them.

## A queued listener receives the same class it subscribed to

The job carries the event's class name, the listener's name, a shallow copy of the event's own properties, and the tenant. On the worker side the dispatcher looks the constructor up by name and rebuilds the instance against its prototype, so **the listener receives something `instanceof UserRegistered`**, not a bare object that happens to have the right keys.

Two consequences follow from a job carrying nothing but data, and both are yours to respect:

- An event's fields must survive `{ ...event }` and JSON. Put ids and scalars on an event, not a Prisma model instance, a `Date` you rely on being a `Date`, or anything with methods.
- Only events with a live listener are resolvable. The name-to-constructor map is filled at `listen()` time, so an event nobody subscribes to has nothing to rebuild.

Events run on their own queue, `heryjs-events`. One queue per processor family, for the reason every other family has its own: a job on a queue whose workers do not recognise its name **is not retried or dead-lettered — the worker returns and BullMQ marks it completed**.

## The tenant is captured at dispatch and reopened in the worker

The tenant id is read inside the request, when the job is built, because the worker has no request to read it from. A queued listener running with no tenant would read and write whatever the unscoped client returns, **across every tenant** — which is why the processor reopens the captured tenant with `runInTenant` around the handler rather than relying on an ambient default.

Dispatching outside a request is legitimate — a CLI backfill, a seeder — so the job records `tenantId: null` rather than guessing. The worker then runs the handler unscoped, which is correct for a backfill and a live hazard for anything else. **A listener that touches tenant-scoped data must not be dispatched from outside a request** unless it establishes its own tenant.

## What the bus deliberately does not do

- **No decorator, no auto-discovery.** Listeners register by calling `listen()`, which means somewhere in your code a module explicitly subscribes. There is no `@OnEvent` scanning your tree, and no registry of subscriptions you did not write.
- **No ordering guarantees between listeners.** They run in registration order today; nothing declares a dependency, and nothing should — two listeners that must happen in sequence are one listener.
- **No delivery guarantee for synchronous listeners.** They run in the dispatching process. If it dies mid-dispatch, they are gone. Use `isQueued` for anything that must survive a crash.
- **No event log.** Nothing persists what was dispatched. [Audit](../guides/security/) records what a caller did; the bus records nothing.
- **No cross-process fan-out for synchronous listeners.** A listener registered in a web process does not run for an event dispatched in a worker unless it is queued.
