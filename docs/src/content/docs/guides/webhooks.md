---
title: Webhooks
description: Receive inbound webhooks with HMAC-SHA256 signature verification, and run every accepted payload through the same Event, Job, Notification, Audit and Signal chain.
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
