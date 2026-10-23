import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '@heryjs/core/jobs';
import { outboundWebhookEnv } from './outbound-webhook.env';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Injectable()
export class WebhookDeliveryPruneTask {
  constructor(
    private readonly deliveries: WebhookDeliveryService,
    private readonly store: ScheduledTaskStore,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'webhook-delivery-prune' })
  async run(): Promise<void> {
    await this.store.run('webhook-delivery-prune', async () => {
      await this.deliveries.prune(
        outboundWebhookEnv.WEBHOOK_DELIVERY_RETENTION_DAYS,
      );
    });
  }
}
