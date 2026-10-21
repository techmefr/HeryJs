---
title: Webhooks
description: Receive inbound webhooks with HMAC-SHA256 signature verification, and send signed outbound webhooks to your tenants' URLs with retries, a dead letter and secret rotation.
---

```bash
pnpm hery install webhooks
```

Two routes:

```ts
POST /webhooks/endpoints    // mint an endpoint and its secret, as an admin
POST /webhooks/:endpointId  // where a third party posts events
```

`POST /webhooks/endpoints` returns `{ id, secret, source }`. Hand the id to whoever calls you back — it is the last path segment of the URL they post to — and the secret to whatever signs their requests. There is no route to see the secret again: rotate by minting a new endpoint.

## Signing a request

The sender computes an HMAC-SHA256 over the timestamp and the exact request body, and sends both as headers:

```ts
const signature = createHmac('sha256', secret)
  .update(timestamp) // ms since epoch, as a string
  .update('.')
  .update(rawBody) // the exact bytes sent, before any parsing
  .digest('hex');
```

```
POST /webhooks/:endpointId
x-webhook-signature: <hex>
x-webhook-timestamp: <ms since epoch>
Content-Type: application/json

{ "event": "invoice.paid" }
```

Signing the raw bytes rather than a re-serialized version of the parsed body is why `main.ts` boots Nest with `rawBody: true` — `req.rawBody` is what gets verified, never `JSON.stringify(req.body)`, which is not guaranteed to reproduce byte-for-byte what was actually sent.

## Verification, and why every rejection looks identical

```ts
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  // ...
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

Three things a caller cannot use to probe the system, because all three collapse to the same 401 with the same message, `'Rejected.'`, and no other detail:

- **An unknown or inactive endpoint id.** Rejected before the signature is even checked, the same way a bad signature would be.
- **A signature that does not match.** Compared with `crypto.timingSafeEqual`, never `===` — a plain string comparison leaks timing information proportional to how many leading bytes match, which is enough to reconstruct a valid signature byte by byte given enough requests.
- **A timestamp outside the tolerance window.** `WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` (5 minutes by default) bounds how old a validly-signed request may be, so a signature captured off the wire cannot be replayed indefinitely — only within that window.

Whether the endpoint id was wrong or the secret was wrong is exactly the kind of thing a probe wants to learn one bit at a time. Answering both the same way gives it nothing.

## The chain: Webhook → Event → Job → Notification → Audit → Signal

A verified request does the minimum before returning `202`: parse the body as JSON and persist it as a `WebhookEvent` row. Everything else happens asynchronously, off a dedicated BullMQ queue:

1. **Event** — the row created before the job is queued, so the caller's `202` response already has a durable `eventId` to reference regardless of what happens next.
2. **Job** — `webhook.process`, on its own queue rather than sharing the mail module's. Two distinct `@Processor` classes sharing one queue would let either one silently swallow the other's job: BullMQ hands a queued job to whichever registered worker is idle, not to the one whose name check would actually match, and a processor that returns early on a name mismatch marks that job **completed** either way.
3. **Notification** — every admin in the endpoint's tenant gets a `webhook.received` notification carrying the event id and source.
4. **Audit** — a `process` entry on the `WebhookEvent` model, through the same hash-chained `writeAuditLog` every other audit entry goes through.
5. **Signal** — a publish on `${tenantId}:webhookEvent`, so a live UI can invalidate without polling.

`processedAt` is stamped last, after the notification and the audit row are both written — so a client polling for it knows the whole chain, not just the database write, has actually run.

## A malformed body is not the same failure as a bad signature

Once the signature passes, a body that fails to parse as JSON gets Nest's ordinary `BadRequestException` (400), not `InvalidWebhookSignatureException`. The distinction matters: a caller who cleared signature verification has already proven they hold the secret, so there is nothing left to protect by staying vague about what was wrong with their JSON.

## Installing

The module adds `WebhookEndpoint` and `WebhookEvent` to `prisma/schema.prisma`, so a fresh install needs a migration:

```bash
pnpm hery migrate --name add_webhooks
```

Next steps after that are the usual ones: import `WebhooksModule` into `src/app.module.ts`, mint an endpoint as an admin, and hand its id and secret to whoever is sending you events.

## Running an exposed action

An endpoint minted with `source: "expose:<action>"` runs that [exposed action](../exposing-actions/#triggers-beyond-the-route) instead of notifying admins, with the payload as its params. See that guide for what it checks.

## Outbound webhooks: sending events to your customers

The same module delivers in the other direction. A tenant admin subscribes a URL to named events, and every matching event is POSTed to it, signed, with retries and a dead letter you can see and replay.

```ts
POST   /webhook-subscriptions            // { url, events: ['webhook.invoice.paid', 'model.*'], description? }
GET    /webhook-subscriptions
PATCH  /webhook-subscriptions/:id        // url, events, description, active
DELETE /webhook-subscriptions/:id
POST   /webhook-subscriptions/:id/rotate-secret   // { graceSeconds? }
GET    /webhook-deliveries               // ?status=pending|delivered|dead&subscriptionId=&page=&limit=
GET    /webhook-deliveries/:id
POST   /webhook-deliveries/:id/redeliver          // a dead delivery, with a fresh attempt budget
```

Every route is admin-only (`canManageWebhooks`) and tenant-scoped. The secret (`whsec_...`) is returned once, when it is created or rotated, and is stored sealed with the [secrets keyring](../secrets/), so set `SECRETS_KEYS` in production.

### Why it lives in this module, on the outbox and the jobs queue

It is a module rather than the kernel because it is optional, it is the only thing here that calls out to a tenant-chosen URL, and the kernel already has the seam: an [outbox](../outbox/) handler. `OutboundWebhookFanout` registers on `webhook.*` and `model.*`, and for each committed message writes one `WebhookDelivery` row per matching subscription and queues one job on its own BullMQ queue (`heryjs-webhook-deliveries`). The outbox gives the transactional guarantee, so an event announced in a transaction that rolls back is never sent. The queue gives each subscription its own retries, so one customer's dead endpoint never delays the others or makes the relay retry a message that already reached everyone else.

### What can be subscribed to

Only messages staged for customers: any name starting `webhook.`, and the `model.created|updated|deleted` messages every tenant-scoped write already stages (ids and field names, never row values). An `event:` message carries a whole event object that was never written with a third party in mind, so it cannot be subscribed to. Announce your own:

```ts
await prisma.$transaction(async (tx) => {
  const invoice = await tx.invoice.update({ where: { id }, data: { paidAt: new Date() } });
  await this.outbox.stage(tx, 'webhook.invoice.paid', { invoiceId: invoice.id });
});
```

Patterns follow the outbox grammar: an exact name, a trailing `*`, or `*` for every deliverable event.

### The request your customer receives

```
POST <url>
x-webhook-id: <delivery id, stable across retries: deduplicate on it>
x-webhook-event: webhook.invoice.paid
x-webhook-attempt: 1
x-webhook-timestamp: <ms since epoch>
x-webhook-signature: v1=<hex>[,v1=<hex>]

{ "id": "<outbox message id>", "event": "webhook.invoice.paid", "createdAt": "...", "data": { ... } }
```

The signature is the one described above, `HMAC-SHA256(secret, timestamp + '.' + rawBody)`, as one `v1=` entry per currently valid secret. A 2xx answer is a delivery; anything else, a timeout or a refused connection is a failed attempt. Redirects are not followed. Delivery is at-least-once.

### Retries and the dead letter

Ten attempts, the delay doubling from 10 seconds (the last retry lands about 85 minutes after the first). After the last one the delivery becomes `dead` and stays in the log with its last status code and error. `POST /webhook-deliveries/:id/redeliver` puts a dead delivery back with a fresh budget. Finished deliveries are pruned after `WEBHOOK_DELIVERY_RETENTION_DAYS` (default 30).

### Rotating the secret without dropping events

`rotate-secret` mints a new secret and keeps the old one for `graceSeconds` (default `WEBHOOK_SECRET_ROTATION_GRACE_SECONDS`, 24 hours). During that window every delivery carries two signatures, so a receiver can switch over whenever it likes and a delivery that was queued before the rotation still verifies. Secrets are read when a delivery is sent, not when it is queued. Rotating twice inside one window drops the oldest secret.

### The URL is checked, because the server makes the request

A subscription URL must be `https`, carry no credentials and resolve only to public addresses. It is checked when written and again before every attempt. DNS can still change between the check and the connection (rebinding), which is why redirects are refused. `WEBHOOK_ALLOW_PRIVATE_URLS=true` lifts the check for local development and is refused in production. The check is a copy of the SSO module's, because a module cannot import another module.

### In the admin panel

The admin lists `/webhook-subscriptions` and `/webhook-deliveries` on its own, since they are argument-free GET routes. The **Webhooks** page adds what introspection cannot: create, edit, enable or disable and delete a subscription, rotate its secret (shown once), browse the delivery log with status and attempts, and a Dead letters tab with a Replay button per delivery. Everything it calls is gated by the same capability as the API.

### Installing it on a project that already has the module

Add the two models (`WebhookSubscription`, `WebhookDelivery`) and a migration, copy the runtime files, and add `WEBHOOK_DELIVERY_QUEUE` to the kernel's jobs constants, module and service. Reinstalling adds the models without touching the inbound ones.
