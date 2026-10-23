import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { authPrismaClient } from '#kernel/public/auth';
import {
  type OutboxDelivery,
  type OutboxHandler,
  OutboxRegistry,
} from '#kernel/public/jobs';
import {
  DELIVERY_STATUS_PENDING,
  MODEL_EVENT_PREFIX,
  OUTBOUND_WEBHOOK_HANDLER,
  WEBHOOK_EVENT_PREFIX,
} from './outbound-webhook.constants';
import { matchesEventPattern } from './webhook-event-pattern';
import { WebhookDeliveryQueue } from './webhook-delivery.queue';

/**
 * The outbox handler that turns a committed message into one delivery per
 * matching subscription. It is the only thing the relay sees: the retries, the
 * backoff and the dead letter of the delivery itself live in the delivery queue,
 * per subscription, so one customer's dead endpoint never holds up the others or
 * makes the relay retry a message that already reached everyone else.
 *
 * The rows are written before the jobs are queued and keyed on
 * (subscription, message), so a crash between the two, or the relay handing the
 * same message over twice, finds the rows already there and queues what is still
 * pending.
 */
@Injectable()
export class OutboundWebhookFanout implements OutboxHandler, OnModuleInit {
  readonly name = OUTBOUND_WEBHOOK_HANDLER;
  readonly names = [`${WEBHOOK_EVENT_PREFIX}*`, `${MODEL_EVENT_PREFIX}*`];

  constructor(
    private readonly registry: OutboxRegistry,
    private readonly queue: WebhookDeliveryQueue,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(delivery: OutboxDelivery): Promise<void> {
    if (delivery.tenantId === null) {
      return;
    }

    const subscriptions = await authPrismaClient.webhookSubscription.findMany({
      where: { tenantId: delivery.tenantId, active: true },
    });
    const body = {
      id: delivery.id,
      event: delivery.name,
      createdAt: delivery.createdAt.toISOString(),
      data: delivery.payload as Prisma.InputJsonObject,
    } satisfies Prisma.InputJsonObject;

    for (const subscription of subscriptions) {
      if (
        !subscription.events.some((pattern) =>
          matchesEventPattern(pattern, delivery.name),
        )
      ) {
        continue;
      }

      const row = await authPrismaClient.webhookDelivery.upsert({
        where: {
          subscriptionId_messageId: {
            subscriptionId: subscription.id,
            messageId: delivery.id,
          },
        },
        create: {
          subscriptionId: subscription.id,
          tenantId: delivery.tenantId,
          messageId: delivery.id,
          event: delivery.name,
          payload: body,
        },
        update: {},
      });

      if (row.status === DELIVERY_STATUS_PENDING) {
        await this.queue.enqueue(row);
      }
    }
  }
}
