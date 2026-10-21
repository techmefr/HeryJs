import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'mail-smtp',
  description:
    'Send mail over SMTP instead of logging it (driver, env, DI wiring)',
  meta: { compatibility: '>=0.0.1' },
  // The owning module's folder, for the reason mail-resend gives: a module may
  // not import another module, so the driver has to land beside the MailDriver
  // contract it implements.
  dest: 'src/modules/mail',
  dependencies: ['nodemailer', '@types/nodemailer'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "SmtpMailModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { mail: { default: process.env.MAIL_DRIVER ?? 'log', drivers: { log: { driver: 'log' }, smtp: { driver: 'smtp' } } } }",
      'Set MAIL_SMTP_HOST, MAIL_SMTP_FROM and, if the server wants them, MAIL_SMTP_USER and MAIL_SMTP_PASSWORD in .env (MAIL_SMTP_PORT defaults to 587, MAIL_SMTP_TLS to starttls), then MAIL_DRIVER=smtp to switch',
    ]);
  },
} satisfies ModuleDefinition;
