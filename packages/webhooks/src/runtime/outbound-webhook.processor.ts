import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { WebhookDelivery, WebhookSubscription } from '@prisma/client';
import { authPrismaClient } from '#kernel/public/auth';
import { WEBHOOK_DELIVERY_QUEUE } from '#kernel/public/jobs';
import {
  DELIVERY_STATUS_DEAD,
  DELIVERY_STATUS_DELIVERED,
  DELIVERY_STATUS_PENDING,
  OUTBOUND_WEBHOOK_JOB,
} from './outbound-webhook.constants';
import { OutboundWebhookSender } from './outbound-webhook.sender';
import type { OutboundResult } from './outbound-webhook.sender';
import type { WebhookDeliveryJobData } from './webhook-delivery.queue';
import { WebhookSubscriptionService } from './webhook-subscription.service';

const SUBSCRIPTION_DISABLED = 'The subscription is disabled or deleted.';

/**
 * Runs one attempt of one delivery and keeps the row honest about it. BullMQ owns
 * the retrying: a failed attempt throws so the job backs off and comes back, and
 * on the last attempt the row is moved to `dead` first, which is the dead letter
 * the delivery log shows. The row is the record; the queue's own failed set is
 * only trimmed history.
 *
 * Delivery is at-least-once: a worker that dies after the endpoint answered 2xx
 * and before the row is updated sends again. `x-webhook-id` is the delivery id on
 * every attempt, so a receiver deduplicates on it.
 */
@Processor(WEBHOOK_DELIVERY_QUEUE)
export class OutboundWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger('OutboundWebhooks');

  constructor(
    private readonly sender: OutboundWebhookSender,
    private readonly subscriptions: WebhookSubscriptionService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== OUTBOUND_WEBHOOK_JOB) {
      return;
    }

    const { deliveryId } = job.data as WebhookDeliveryJobData;
    const delivery = await authPrismaClient.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { subscription: true },
    });

    if (!delivery || delivery.status !== DELIVERY_STATUS_PENDING) {
      return;
    }

    const { subscription } = delivery;

    if (!subscription.active) {
      await this.markDead(delivery.id, SUBSCRIPTION_DISABLED, null);
      return;
    }

    const attempt = delivery.attempts + 1;
    const result = await this.attempt(delivery, attempt);

    if (result.isDelivered) {
      await authPrismaClient.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: DELIVERY_STATUS_DELIVERED,
          attempts: attempt,
          lastStatusCode: result.statusCode,
          lastError: null,
          lastAttemptAt: new Date(),
          deliveredAt: new Date(),
        },
      });

      return;
    }

    const reason = result.error ?? 'The delivery failed.';
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    if (isLastAttempt) {
      await this.markDead(delivery.id, reason, result.statusCode, attempt);
      this.logger.error(
        `Webhook delivery ${delivery.id} (${delivery.event}) is dead after ${attempt} attempts: ${reason}`,
      );
    } else {
      await authPrismaClient.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts: attempt,
          lastStatusCode: result.statusCode,
          lastError: reason,
          lastAttemptAt: new Date(),
        },
      });
    }

    throw new Error(reason);
  }

  // A secret that cannot be opened (a key dropped from SECRETS_KEYS) is a
  // failed attempt like any other: left to throw here it would skip the row
  // update and leave the delivery pending forever after the last retry.
  private async attempt(
    delivery: WebhookDelivery & { subscription: WebhookSubscription },
    attempt: number,
  ): Promise<OutboundResult> {
    let secrets: string[];

    try {
      secrets = this.subscriptions.signingSecrets(delivery.subscription);
    } catch {
      return {
        isDelivered: false,
        statusCode: null,
        error: 'The signing secret could not be read.',
      };
    }

    return this.sender.send({
      url: delivery.subscription.url,
      deliveryId: delivery.id,
      event: delivery.event,
      attempt,
      body: JSON.stringify(delivery.payload),
      secrets,
    });
  }

  private async markDead(
    id: string,
    reason: string,
    statusCode: number | null,
    attempts?: number,
  ): Promise<void> {
    await authPrismaClient.webhookDelivery.update({
      where: { id },
      data: {
        status: DELIVERY_STATUS_DEAD,
        attempts,
        lastStatusCode: statusCode,
        lastError: reason,
        lastAttemptAt: new Date(),
        deadAt: new Date(),
      },
    });
  }
}
