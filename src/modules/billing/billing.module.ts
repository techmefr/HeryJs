import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
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
