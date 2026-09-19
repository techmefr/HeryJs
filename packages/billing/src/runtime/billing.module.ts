import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { JobsModule } from '#kernel/jobs/jobs.module';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { BillingDriverRegistry } from './billing-driver.registry';
import { BillingService } from './billing.service';
import { BillingSubscriptionMirror } from './billing-subscription.mirror';
import { BillingWebhookController } from './billing.webhook.controller';
import { BillingWebhookGuard } from './billing-webhook.guard';
import { BillingWebhookProcessor } from './billing.webhook.processor';
import { LogBillingDriver } from './log-billing.driver';

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
