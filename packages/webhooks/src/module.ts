import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/modules/webhooks';
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

function patchSchema(): void {
  const schema = readFileSync(SCHEMA_FILE, 'utf8');

  if (schema.includes('model WebhookEndpoint')) {
    console.log(
      pc.yellow(`${SCHEMA_FILE} already has WebhookEndpoint, skipping.`),
    );
    return;
  }

  writeFileSync(SCHEMA_FILE, schema.trimEnd() + '\n' + WEBHOOK_MODELS);
  console.log(pc.green(`✔ patched ${SCHEMA_FILE}`));
}

registerModule({
  name: 'webhooks',
  channel: 'official',
  description:
    'Receive inbound webhooks with HMAC-SHA256 signature verification (constant-time, timestamp-tolerant against replay) and run each accepted payload through Event, Job, Notification, Audit and Signal.',
  dependencies: [],
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);
    patchSchema();

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(`  1. Run "pnpm hery migrate --name add_webhooks"`);
    console.log(
      `  2. Import ${pc.bold('WebhooksModule')} into src/app.module.ts`,
    );
    console.log(
      `  3. POST /webhooks/endpoints as an admin to mint an endpoint and its secret, then have the sender sign each request as HMAC-SHA256(secret, timestamp + '.' + rawBody) in the x-webhook-signature and x-webhook-timestamp headers`,
    );
    console.log(
      `  4. Tune the replay window with WEBHOOK_SIGNATURE_TOLERANCE_SECONDS (default 300)`,
    );
  },
});
