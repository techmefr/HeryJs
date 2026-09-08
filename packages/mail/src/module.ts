import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';

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

export default defineModule({
  name: 'mail',
  description:
    'Add outgoing mail: a MailLog resource, string templates, and a BullMQ job that actually sends. Ships with a console-logging provider by default -- swap MAIL_PROVIDER for a real one.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/mail',
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.patch(
      SCHEMA_FILE,
      'model MailLog',
      (schema) => schema.trimEnd() + '\n' + MAIL_LOG_MODEL,
    );

    context.nextSteps([
      'Run "pnpm hery migrate --name add_mail_log"',
      `Import ${pc.bold('MailModule')} into src/app.module.ts`,
      `Inject ${pc.bold('MailService')} and call ${pc.bold('.queue(to, templateName, data)')} from any resource that needs to send mail`,
    ]);
  },
});
