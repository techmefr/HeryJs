import { Injectable } from '@nestjs/common';
import type { Prisma, WebhookDelivery } from '@prisma/client';
import { authPrismaClient } from '#technical/public/auth';
import type { Page, PageQuery } from '#technical/public/http';
import {
  DELIVERY_STATUS_DEAD,
  DELIVERY_STATUS_PENDING,
} from './outbound-webhook.constants';
import type { DeliveryFilter } from './outbound-webhook.dto';
import { WebhookDeliveryQueue } from './webhook-delivery.queue';
import { WebhookNotFoundException } from './webhook-not-found.exception';
import { WebhookRefusedException } from './webhook-refused.exception';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class WebhookDeliveryService {
  constructor(private readonly queue: WebhookDeliveryQueue) {}

  async list(
    tenantId: string,
    filter: DeliveryFilter,
    page: PageQuery,
  ): Promise<Page<WebhookDelivery>> {
    const where: Prisma.WebhookDeliveryWhereInput = {
      tenantId,
      status: filter.status,
      subscriptionId: filter.subscriptionId,
    };
    const [records, total] = await Promise.all([
      authPrismaClient.webhookDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      authPrismaClient.webhookDelivery.count({ where }),
    ]);

    return { records, total };
  }

  async get(tenantId: string, id: string): Promise<WebhookDelivery> {
    const delivery = await authPrismaClient.webhookDelivery.findFirst({
      where: { id, tenantId },
    });

    if (!delivery) {
      throw new WebhookNotFoundException('delivery');
    }

    return delivery;
  }

  /**
   * Puts a dead delivery back on the queue with a fresh attempt budget. The
   * status change is the claim, made in one conditional update, so two admins
   * clicking at once queue one run, not two.
   */
  async redeliver(tenantId: string, id: string): Promise<WebhookDelivery> {
    const { count } = await authPrismaClient.webhookDelivery.updateMany({
      where: { id, tenantId, status: DELIVERY_STATUS_DEAD },
      data: {
        status: DELIVERY_STATUS_PENDING,
        attempts: 0,
        round: { increment: 1 },
        deadAt: null,
      },
    });

    if (count === 0) {
      await this.get(tenantId, id);
      throw new WebhookRefusedException('delivery-not-dead');
    }

    const delivery = await this.get(tenantId, id);

    await this.queue.enqueue(delivery);

    return delivery;
  }

  /** Delivered and dead rows older than the retention window; pending are kept. */
  async prune(retentionDays: number, now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - retentionDays * MS_PER_DAY);
    const { count } = await authPrismaClient.webhookDelivery.deleteMany({
      where: {
        status: { not: DELIVERY_STATUS_PENDING },
        createdAt: { lt: before },
      },
    });

    return count;
  }
}
