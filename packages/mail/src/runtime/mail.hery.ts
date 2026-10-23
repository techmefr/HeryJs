import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { MailModule } from './mail.module';

export default defineHeryModule({
  name: '@heryjs/mail',
  module: () => MailModule,
  options: noOptions,
  prisma: {
    models: ['MailLog'],
    annotations: ['@hery.appEnforcedTenant'],
  },
  extensionPoints: ['mail.driver', 'auth.mailer'],
});
