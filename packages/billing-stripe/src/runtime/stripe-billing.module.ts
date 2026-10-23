import { Global, Module } from '@nestjs/common';
import { billingDriverToken } from '@heryjs/core/drivers';
import { StripeBillingDriver } from './stripe-billing.driver';

const TOKEN = billingDriverToken('stripe');

@Global()
@Module({
  providers: [
    StripeBillingDriver,
    { provide: TOKEN, useExisting: StripeBillingDriver },
  ],
  exports: [TOKEN],
})
export class StripeBillingModule {}
