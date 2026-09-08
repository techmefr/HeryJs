import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';

const SCHEMA_FILE = 'prisma/schema.prisma';

const WEBHOOK_MODELS = `
// A webhook secret is stored in plaintext, unlike a password or an API key:
// verifying an inbound signature means recomputing the same HMAC the sender
// used, so this cannot be a one-way hash.
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
  payload     Json
  receivedAt  DateTime  @default(now())
  processedAt DateTime?

  endpoint WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([endpointId])
}
`;

export default defineModule({
  name: 'webhooks',
  description:
    'Receive inbound webhooks with HMAC-SHA256 signature verification (constant-time, timestamp-tolerant against replay) and run each accepted payload through Event, Job, Notification, Audit and Signal.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/webhooks',
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.patch(
      SCHEMA_FILE,
      'model WebhookEndpoint',
      (schema) => schema.trimEnd() + '\n' + WEBHOOK_MODELS,
    );

    context.nextSteps([
      'Run "pnpm hery migrate --name add_webhooks"',
      `Import ${pc.bold('WebhooksModule')} into src/app.module.ts`,
      "POST /webhooks/endpoints as an admin to mint an endpoint and its secret, then have the sender sign each request as HMAC-SHA256(secret, timestamp + '.' + rawBody) in the x-webhook-signature and x-webhook-timestamp headers",
      'Tune the replay window with WEBHOOK_SIGNATURE_TOLERANCE_SECONDS (default 300)',
    ]);
  },
});
