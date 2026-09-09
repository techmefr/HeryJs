import type { ModuleDefinition } from 'heryjs';

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

export default {
  name: 'mail',
  description:
    'Add outgoing mail: a MailLog resource, string templates, and a BullMQ job that actually sends. Ships with a console-logging provider by default -- swap MAIL_PROVIDER for a real one.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(MAIL_LOG_MODEL);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_mail_log"',
      `Import "MailModule" into src/app.module.ts`,
      `Inject "MailService" and call ".queue(to, templateName, data)" from any resource that needs to send mail`,
    ]);
  },
} satisfies ModuleDefinition;
