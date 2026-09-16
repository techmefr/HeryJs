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
    'Add outgoing mail: a MailLog resource, string templates, and a BullMQ job that actually sends. Ships with a log driver by default -- install a driver package and set MAIL_DRIVER to send for real.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(MAIL_LOG_MODEL);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_mail_log"',
      `Import "MailModule" into src/app.module.ts`,
      `Inject "MailService" and call ".send(new WelcomeMail(user))" from any resource that needs to send mail`,
      'Generate a mailable with "pnpm hery make:mail WelcomeMail"',
      "Declare the driver in hery.config.ts, e.g. { mail: { default: process.env.MAIL_DRIVER ?? 'log', drivers: { log: { driver: 'log' } } } }",
    ]);
  },
} satisfies ModuleDefinition;
