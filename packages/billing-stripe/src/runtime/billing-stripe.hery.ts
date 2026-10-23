import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { StripeBillingModule } from './stripe-billing.module';

export default defineHeryModule({
  name: '@heryjs/billing-stripe',
  module: () => StripeBillingModule,
  options: noOptions,
  requires: ['@heryjs/billing'],
  extensionPoints: ['billing.driver'],
});
