import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/modules/mail';
const SCHEMA_FILE = 'prisma/schema.prisma';

const MAIL_LOG_MODEL = `
model MailLog {
  id        String    @id @default(cuid())
  tenantId  String
  to        String
  subject   String
  status    String    @default("queued")
  error     String?
  createdAt DateTime  @default(now())
  sentAt    DateTime?

  @@index([tenantId])
}
`;

function patchSchema(): void {
  const schema = readFileSync(SCHEMA_FILE, 'utf8');

  if (schema.includes('model MailLog')) {
    console.log(pc.yellow(`${SCHEMA_FILE} already has MailLog, skipping.`));
    return;
  }

  writeFileSync(SCHEMA_FILE, schema.trimEnd() + '\n' + MAIL_LOG_MODEL);
  console.log(pc.green(`✔ patched ${SCHEMA_FILE}`));
}

registerModule({
  name: 'mail',
  channel: 'official',
  description:
    'Add outgoing mail: a MailLog resource, string templates, and a BullMQ job that actually sends. Ships with a console-logging provider by default -- swap MAIL_PROVIDER for a real one.',
  dependencies: [],
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);
    patchSchema();

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(`  1. Run "pnpm hery migrate --name add_mail_log"`);
    console.log(`  2. Import ${pc.bold('MailModule')} into src/app.module.ts`);
    console.log(
      `  3. Inject ${pc.bold('MailService')} and call ${pc.bold('.queue(to, templateName, data)')} from any resource that needs to send mail`,
    );
  },
});
