import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'notifier',
  description:
    'Notify a recipient by whatever channel they have agreed to: one notification class rendered once per channel, dispatched independently over mail, sms and push, with a per-channel result instead of one verdict.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Install "mail", "sms" and "push" first if you have not already -- the notifier composes them rather than replacing them',
      'Import "NotifierModule" into src/app.module.ts',
      'Write a notification class implementing "toMail", "toSms" and/or "toPush" from "#modules/notifier/notification", each returning the same rendered-message shape its channel already accepts',
      'Inject "NotifierService" and call ".send(recipient, new YourNotification())" -- it never throws for a single channel failing, and reports each channel\'s outcome instead',
    ]);
  },
} satisfies ModuleDefinition;
