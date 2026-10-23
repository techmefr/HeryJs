import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { NotifierModule } from './notifier.module';

export default defineHeryModule({
  name: '@heryjs/notifier',
  module: () => NotifierModule,
  options: noOptions,
  requires: ['@heryjs/mail', '@heryjs/sms', '@heryjs/push'],
  prisma: {
    models: [
      'NotificationPreference',
      'NotificationSetting',
      'NotificationDigestEntry',
    ],
    annotations: ['@hery.appEnforcedTenant', '@hery.tenantScoped'],
  },
  extensionPoints: ['notifications.channel'],
});
