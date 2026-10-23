import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { BillingModule } from './billing.module';

export default defineHeryModule({
  name: '@heryjs/billing',
  module: () => BillingModule,
  options: noOptions,
  prisma: {
    models: ['BillingSubscription'],
    annotations: ['@hery.tenantScoped'],
  },
  extensionPoints: ['billing.quotas'],
});
