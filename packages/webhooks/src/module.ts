import type { ModuleDefinition } from 'heryjs';

const WEBHOOK_MODELS = `
// The secret is sealed with the kernel's SecretsService: verifying an inbound
// signature recomputes the sender's HMAC, so it cannot be a one-way hash, but
// it does not have to sit readable in the table. deliveryId is the sender's own
// event id, or a hash of the signed bytes, so a redelivery is recorded once.
model WebhookEndpoint {
  id        String   @id @default(cuid())
  tenantId  String
  source    String
  secret    String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  events WebhookEvent[]

  @@index([tenantId])
}

model WebhookEvent {
  id          String    @id @default(cuid())
  endpointId  String
  tenantId    String
  source      String
  deliveryId  String?
  payload     Json
  receivedAt  DateTime  @default(now())
  processedAt DateTime?

  endpoint WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)

  @@unique([tenantId, endpointId, deliveryId])
  @@index([tenantId])
  @@index([endpointId])
}
`;

const OUTBOUND_WEBHOOK_MODELS = `
// A customer's own URL receiving signed events. The secret is sealed with the
// kernel's SecretsService: signing needs the plaintext back, so it cannot be a
// one-way hash, but it does not have to sit readable in the table. During a
// rotation the previous secret stays valid until previousSecretExpiresAt, and
// every delivery in that window carries a signature for both.
model WebhookSubscription {
  id                      String    @id @default(cuid())
  tenantId                String
  url                     String
  description             String?
  events                  String[]
  secret                  String
  previousSecret          String?
  previousSecretExpiresAt DateTime?
  active                  Boolean   @default(true)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  deliveries WebhookDelivery[]

  @@index([tenantId])
}

// One row per (subscription, outbox message): the delivery log and the dead
// letter in the same table. The unique pair is what makes the fan-out
// idempotent when the relay hands the same message over twice. round counts
// manual redeliveries, so each run gets a queue job id of its own.
model WebhookDelivery {
  id             String    @id @default(cuid())
  subscriptionId String
  tenantId       String
  messageId      String
  event          String
  payload        Json
  status         String    @default("pending")
  attempts       Int       @default(0)
  round          Int       @default(0)
  lastStatusCode Int?
  lastError      String?
  lastAttemptAt  DateTime?
  deliveredAt    DateTime?
  deadAt         DateTime?
  createdAt      DateTime  @default(now())

  subscription WebhookSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@unique([subscriptionId, messageId])
  @@index([tenantId, status])
  @@index([subscriptionId])
}
`;

export default {
  name: 'webhooks',
  description:
    "Receive inbound webhooks with HMAC-SHA256 signature verification (constant-time, timestamp-tolerant against replay) and run each accepted payload through Event, Job, Notification, Audit and Signal, and deliver signed outbound webhooks to your tenants' own URLs with retry, a dead-letter state and secret rotation.",
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(WEBHOOK_MODELS);
    context.addPrismaModels(OUTBOUND_WEBHOOK_MODELS);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_webhooks"',
      `Import "WebhooksModule" into src/app.module.ts`,
      "POST /webhooks/endpoints as an admin to mint an endpoint and its secret, then have the sender sign each request as HMAC-SHA256(secret, timestamp + '.' + rawBody) in the x-webhook-signature and x-webhook-timestamp headers, and its own event id in x-webhook-id so a redelivery is recorded once",
      'Tune the replay window with WEBHOOK_SIGNATURE_TOLERANCE_SECONDS (default 300)',
      'Outbound: a tenant admin POSTs /webhook-subscriptions with a public https url and the events it wants (webhook.* and model.* names), and keeps the returned secret, which is shown once',
      "Announce your own event next to a write with outbox.stage(tx, 'webhook.invoice.paid', payload); model.created, model.updated and model.deleted are delivered for every tenant-scoped model without any code",
      'Set SECRETS_KEYS in production (pnpm hery secrets:key): subscription secrets are sealed with it, and the app refuses to boot on the development key',
      'Read the delivery log and the dead letters with GET /webhook-deliveries?status=dead, and retry one with POST /webhook-deliveries/:id/redeliver',
    ]);
  },
} satisfies ModuleDefinition;
