import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { WebhooksModule } from './webhooks.module';

export default defineHeryModule({
  name: '@heryjs/webhooks',
  module: () => WebhooksModule,
  options: noOptions,
  prisma: {
    models: [
      'WebhookEndpoint',
      'WebhookEvent',
      'WebhookSubscription',
      'WebhookDelivery',
    ],
    annotations: ['@hery.appEnforcedTenant'],
  },
  extensionPoints: ['exposition', 'webhooks.handler'],
});
