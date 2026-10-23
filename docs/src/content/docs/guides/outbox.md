---
title: Transactional outbox
description: Writing a row and announcing it as one atomic step — outbox rows committed with the change, a relay that delivers them at-least-once, retries, a dead letter and prune.
---

A handler writes a row and then dispatches an event, a job or a notification. Those are two systems, and nothing makes them one. If the process dies between the commit and the dispatch, the record exists and nobody was told. If the dispatch comes first and the commit rolls back, somebody was told about a record that never existed.

The outbox closes the gap the way Laravel's `afterCommit` and Supabase's in-database queues do: the announcement is **a row in the same database, written in the same transaction as the change**. Both commit or neither does. A separate relay then delivers what committed.

## Generated CRUD goes through it already

Every `create`, `update`, `upsert` and `delete` of a model annotated `/// @hery.tenantScoped` stages one message inside the transaction of the write itself. The tenant-scoped Prisma client does it, so a generated service has nothing to remember and a hand-written one cannot forget.

| Write | Message |
| --- | --- |
| `create`, `createManyAndReturn` | `model.created` |
| `update`, `updateManyAndReturn`, `upsert` | `model.updated` |
| `update` that stamps `deletedAt`, `delete` | `model.deleted` |

The payload carries `model`, `kind`, `recordId`, `tenantId`, `changedFields`, `ownerId`, `teamId`, `userId` and `impersonatedBy`. `ownerId` and `teamId` are the two keys capabilities are decided on, so a handler can route a message by who may see the row without loading it. **It never carries the row's other values**: a message outlives the request, sits in a table, and may reach handlers that must not see a field. A consumer that needs the row reads it, under its own capabilities.

Not announced, deliberately: `createMany`, `updateMany` and `deleteMany`, whose result is a count with no ids to name; writes through the unscoped client (a purge writes its own audit entry and goes around the extension on purpose); and `AppNotification`, which is itself the product of a side effect.

## Reacting to a model change on the events bus

The bridge handler turns every `model.*` message into a `ModelChanged` event on the [events bus](../events/):

```ts
this.events.listen(ModelChanged, {
  name: 'ReindexOnChange',
  isQueued: true,
  handle: async (event) => {
    if (event.model === 'BlogPost') {
      await this.search.reindex(event.recordId);
    }
  },
});
```

The relay reopens the message's tenant around the handler, so a sync listener and the tenant a queued one captures are both the tenant of the write.

## Staging your own message

Inside any Prisma transaction you hold, stage next to your write:

```ts
await prisma.$transaction(async (tx) => {
  const invoice = await tx.invoice.update({ where: { id }, data: { paidAt: new Date() } });
  await this.outbox.stageEvent(tx, new InvoicePaid(invoice.id, invoice.total));
});
```

`stageEvent` names the message after the event's class, and the bridge rebuilds it on the other side exactly as a queued listener's job does. `stage(tx, name, payload)` writes a message under any name you choose, for a handler of your own.

## A handler is a name and the messages it takes

```ts
this.registry.register({
  name: 'billing-webhook',
  names: ['model.created', 'invoice.*'],
  handle: async (delivery) => {
    await this.webhooks.send(delivery.id, delivery.payload);
  },
});
```

`names` takes an exact name, a trailing wildcard (`model.*`) or `*`. The handler `name` keys its delivery receipts, so it is stable data like a listener's name, and two handlers cannot share one. This is the seam a webhook sender or the notifier registers on; the bridge to the events bus is just the first handler.

## At-least-once, so consumers are idempotent

The relay runs on its own BullMQ queue, `heryjs-outbox`, as a repeating job, and holds the [distributed lock](../lock/) `outbox:relay` while it drains, so one relay runs at a time across every instance. Each pass takes due pending messages, oldest first, and hands each to every matching handler.

Two things make a retry safe:

- **The message id is the idempotency key.** `delivery.id` is identical on every attempt, and `delivery.attempt` says which one this is. A handler that talks to something external passes `delivery.id` along as that system's idempotency key.
- **A receipt per handler.** A handler that finishes records a receipt. When another handler of the same message fails and the message is retried, only the handlers without a receipt run again.

A crash between a handler finishing and its receipt being written reruns that handler once. That is what at-least-once means, and it is why the id exists.

## Retries and the dead letter

A failed delivery backs off exponentially: 2 seconds, doubling, capped at 15 minutes. A failing message waits out its own backoff while the ones behind it go ahead, so one poison message never blocks the queue. **That also means there is no ordering guarantee across messages** — a message that fails and succeeds on retry is delivered after later ones.

After 8 attempts a message becomes `dead` and stops being retried. Dead messages keep their last error:

```ts
const dead = await this.outbox.deadLetters();
await this.outbox.requeue(dead[0].id);
```

`requeue` puts it back to pending with a fresh attempt count. Its receipts stay, so a handler that had already finished does not run again.

A message no registered handler matches is marked delivered rather than kept: nothing was waiting for it.

## Prune

A daily scheduled task (`outbox-prune`) deletes delivered messages after 7 days and dead ones after 30, receipts first. Pending messages are never pruned.

## Running the relay

`OutboxModule` is imported by `AppModule`, and the relay starts with the app. To run it on dedicated workers only, set `OUTBOX_RELAY_ENABLED=false` on the web processes. `OUTBOX_RELAY_INTERVAL_MS` (default 2000) is how often a pass runs, and so the latency added to a delivery.

## What it deliberately does not do

- **No exactly-once.** At-least-once with an idempotency key is the honest contract.
- **No ordering across messages.** See the backoff above.
- **No row data in model messages.** Read the row.
- **A failing sync listener fails the bridge's whole delivery.** The events bus runs a message's listeners as one unit, so on retry they all run again. Queue a listener that is not idempotent.
