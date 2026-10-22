import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { ExpositionModule } from '#kernel/exposition/exposition.module';
import { JobsModule } from '#kernel/jobs/jobs.module';
import { NotificationsModule } from '#kernel/notifications/notifications.module';
import { PrivacyModule } from '#kernel/privacy/privacy.module';
import { OutboxModule } from '#kernel/outbox/outbox.module';
import { SchedulerModule } from '#kernel/scheduler/scheduler.module';
import { SignalModule } from '#kernel/signal/signal.module';
import {
  DELIVERY_POLICY,
  OUTBOUND_WEBHOOK_POLICY,
} from './outbound-webhook.constants';
import { OutboundWebhookFanout } from './outbound-webhook.fanout';
import { OutboundWebhookProcessor } from './outbound-webhook.processor';
import {
  OutboundWebhookSender,
  WEBHOOK_FETCH,
} from './outbound-webhook.sender';
import { WebhookDeliveryController } from './webhook-delivery.controller';
import { WebhookDeliveryPruneTask } from './webhook-delivery.prune.task';
import { WebhookDeliveryQueue } from './webhook-delivery.queue';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookSecretService } from './webhook-secret.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhookSubscriptionController } from './webhook-subscription.controller';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { systemHostResolver, WEBHOOK_HOST_RESOLVER } from './webhook-url-guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksPersonalData } from './webhooks.personal-data';
import { WebhooksProcessor } from './webhooks.processor';
import { WebhooksService } from './webhooks.service';
import './webhooks.catalogue';

@Module({
  imports: [
    AuthModule,
    ExpositionModule,
    JobsModule,
    NotificationsModule,
    OutboxModule,
    PrivacyModule,
    SchedulerModule,
    SignalModule,
  ],
  controllers: [
    WebhooksController,
    WebhookSubscriptionController,
    WebhookDeliveryController,
  ],
  providers: [
    WebhooksService,
    WebhooksPersonalData,
    WebhooksProcessor,
    WebhookSignatureGuard,
    { provide: OUTBOUND_WEBHOOK_POLICY, useValue: DELIVERY_POLICY },
    { provide: WEBHOOK_FETCH, useValue: fetch },
    { provide: WEBHOOK_HOST_RESOLVER, useValue: systemHostResolver },
    WebhookSecretService,
    WebhookSubscriptionService,
    WebhookDeliveryService,
    WebhookDeliveryQueue,
    WebhookDeliveryPruneTask,
    OutboundWebhookFanout,
    OutboundWebhookSender,
    OutboundWebhookProcessor,
  ],
})
export class WebhooksModule {}
