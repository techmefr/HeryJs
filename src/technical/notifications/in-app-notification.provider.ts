import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import type { Page, PageQuery } from '#technical/http/page-query';
import type { Notification, NotificationProvider } from './notification.types';

@Injectable()
export class InAppNotificationProvider implements NotificationProvider {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  send(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Notification> {
    return this.prisma.appNotification.create({
      data: { userId, type, payload },
    });
  }

  async listFor(userId: string, page: PageQuery): Promise<Page<Notification>> {
    const where = { userId };

    // The id breaks a createdAt tie: two notifications written in the same
    // millisecond order arbitrarily otherwise, and an order that changes
    // between two requests puts a row on two pages or on none.
    const [records, total] = await Promise.all([
      this.prisma.appNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.appNotification.count({ where }),
    ]);

    return { records, total };
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.appNotification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new RecordNotFoundException('Notification');
    }

    return this.prisma.appNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
