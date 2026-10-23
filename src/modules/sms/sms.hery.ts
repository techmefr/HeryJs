import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { SmsModule } from './sms.module';

export default defineHeryModule({
  name: '@heryjs/sms',
  module: () => SmsModule,
  options: noOptions,
  prisma: {
    models: ['SmsConsent'],
    annotations: ['@hery.tenantScoped'],
  },
  extensionPoints: ['sms.driver', 'auth.smsSender'],
});
