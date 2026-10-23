import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/public/config';
import { DriversModule } from '#kernel/public/drivers';
import { JobsModule } from '#kernel/public/jobs';
import { PrismaModule } from '#kernel/public/database';
import { BillingDriverRegistry } from './billing-driver.registry';
import { BillingService } from './billing.service';
import { BillingSubscriptionMirror } from './billing-subscription.mirror';
import { BillingWebhookController } from './billing.webhook.controller';
import { BillingWebhookGuard } from './billing-webhook.guard';
import { BillingWebhookProcessor } from './billing.webhook.processor';
import { LogBillingDriver } from './log-billing.driver';
import './billing.catalogue';

@Module({
  imports: [PrismaModule, HeryConfigModule, DriversModule, JobsModule],
  controllers: [BillingWebhookController],
  providers: [
    BillingDriverRegistry,
    LogBillingDriver,
    BillingWebhookGuard,
    BillingWebhookProcessor,
    BillingSubscriptionMirror,
    BillingService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
