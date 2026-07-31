import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
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

  listFor(userId: string): Promise<Notification[]> {
    return this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
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
