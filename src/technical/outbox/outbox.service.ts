import { Injectable } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { stageOutboxMessages } from './outbox-stage';
import {
  OUTBOX_DEAD_RETENTION_DAYS,
  OUTBOX_DELIVERED_RETENTION_DAYS,
  OUTBOX_EVENT_NAME_PREFIX,
  OUTBOX_STATUS_DEAD,
  OUTBOX_STATUS_DELIVERED,
  OUTBOX_STATUS_PENDING,
} from './outbox.constants';
import type { OutboxStageClient } from './outbox.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DeadLetter {
  id: string;
  name: string;
  tenantId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  deadAt: Date | null;
}

function currentTenantId(): string | null {
  try {
    return TenantContextStorage.getTenantId();
  } catch {
    return null;
  }
}

@Injectable()
export class OutboxService {
  async stage(
    tx: OutboxStageClient,
    name: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await stageOutboxMessages(tx, [
      { name, payload, tenantId: currentTenantId() },
    ]);
  }

  async stageEvent(tx: OutboxStageClient, event: object): Promise<void> {
    await this.stage(
      tx,
      `${OUTBOX_EVENT_NAME_PREFIX}${event.constructor.name}`,
      {
        ...event,
      },
    );
  }

  async deadLetters(limit = 50): Promise<DeadLetter[]> {
    return authPrismaClient.outboxMessage.findMany({
      where: { status: OUTBOX_STATUS_DEAD },
      orderBy: { deadAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        tenantId: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        deadAt: true,
      },
    });
  }

  async prune(now: Date = new Date()): Promise<number> {
    const deliveredBefore = new Date(
      now.getTime() - OUTBOX_DELIVERED_RETENTION_DAYS * MS_PER_DAY,
    );
    const deadBefore = new Date(
      now.getTime() - OUTBOX_DEAD_RETENTION_DAYS * MS_PER_DAY,
    );
    const expired = {
      OR: [
        {
          status: OUTBOX_STATUS_DELIVERED,
          deliveredAt: { lt: deliveredBefore },
        },
        { status: OUTBOX_STATUS_DEAD, deadAt: { lt: deadBefore } },
      ],
    };

    return authPrismaClient.$transaction(async (tx) => {
      const messages = await tx.outboxMessage.findMany({
        where: expired,
        select: { id: true },
      });
      const ids = messages.map((message) => message.id);

      await tx.outboxReceipt.deleteMany({ where: { messageId: { in: ids } } });
      const { count } = await tx.outboxMessage.deleteMany({
        where: { id: { in: ids } },
      });

      return count;
    });
  }

  async requeue(id: string): Promise<boolean> {
    const { count } = await authPrismaClient.outboxMessage.updateMany({
      where: { id, status: OUTBOX_STATUS_DEAD },
      data: {
        status: OUTBOX_STATUS_PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        deadAt: null,
      },
    });

    return count === 1;
  }
}
