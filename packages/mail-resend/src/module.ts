import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'mail-resend',
  description:
    'Send mail through Resend instead of logging it (driver, env, DI wiring)',
  meta: { compatibility: '>=0.0.1' },
  // The owning module's folder, not a folder of its own: a module may not
  // import another module, so a driver living in src/modules/mail-resend could
  // never reach the MailDriver contract. Landing beside it makes the import a
  // sibling one, and makes uninstalling mail take its drivers with it.
  dest: 'src/modules/mail',
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "ResendMailModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { mail: { default: process.env.MAIL_DRIVER ?? 'log', drivers: { log: { driver: 'log' }, resend: { driver: 'resend' } } } }",
      'Set RESEND_API_KEY and RESEND_FROM in .env, then MAIL_DRIVER=resend to switch',
    ]);
  },
} satisfies ModuleDefinition;
