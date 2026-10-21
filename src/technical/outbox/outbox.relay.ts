import { Injectable, Logger } from '@nestjs/common';
import type { OutboxMessage } from '@prisma/client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { LockService } from '#technical/lock/lock.service';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import {
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_BACKOFF_CAP_MS,
  OUTBOX_BATCH_SIZE,
  OUTBOX_ERROR_MAX_LENGTH,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RELAY_LOCK,
  OUTBOX_STATUS_DEAD,
  OUTBOX_STATUS_DELIVERED,
  OUTBOX_STATUS_PENDING,
} from './outbox.constants';
import { OutboxRegistry } from './outbox.registry';
import type { OutboxDelivery, OutboxHandler } from './outbox.types';

const MAX_BATCHES_PER_RUN = 20;

export interface OutboxDrainResult {
  delivered: number;
  retried: number;
  dead: number;
}

export function outboxBackoffMs(attempts: number): number {
  return Math.min(
    OUTBOX_BACKOFF_CAP_MS,
    OUTBOX_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1),
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asPayload(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger('Outbox');

  constructor(
    private readonly registry: OutboxRegistry,
    private readonly locks: LockService,
  ) {}

  async drain(): Promise<OutboxDrainResult | null> {
    const lock = await this.locks.acquire(OUTBOX_RELAY_LOCK);

    if (!lock) {
      return null;
    }

    try {
      return await this.drainUnderLock();
    } finally {
      await lock.release();
    }
  }

  private async drainUnderLock(): Promise<OutboxDrainResult> {
    const result: OutboxDrainResult = { delivered: 0, retried: 0, dead: 0 };

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const messages = await authPrismaClient.outboxMessage.findMany({
        where: {
          status: OUTBOX_STATUS_PENDING,
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: OUTBOX_BATCH_SIZE,
      });

      if (messages.length === 0) {
        return result;
      }

      for (const message of messages) {
        const outcome = await this.deliver(message);
        result[outcome] += 1;
      }
    }

    return result;
  }

  private async deliver(
    message: OutboxMessage,
  ): Promise<keyof OutboxDrainResult> {
    const handlers = this.registry.handlersFor(message.name);
    const receipts = await authPrismaClient.outboxReceipt.findMany({
      where: { messageId: message.id },
      select: { handler: true },
    });
    const finished = new Set(receipts.map((receipt) => receipt.handler));
    const failures: string[] = [];

    for (const handler of handlers) {
      if (finished.has(handler.name)) {
        continue;
      }

      try {
        await this.run(handler, message);
      } catch (error) {
        failures.push(`${handler.name}: ${describe(error)}`);
        this.logger.warn(
          `Handler ${handler.name} failed on ${message.name} ${message.id}: ${describe(error)}`,
        );
      }
    }

    if (failures.length === 0) {
      await authPrismaClient.outboxMessage.updateMany({
        where: { id: message.id, status: OUTBOX_STATUS_PENDING },
        data: {
          status: OUTBOX_STATUS_DELIVERED,
          deliveredAt: new Date(),
          lastError: null,
        },
      });

      return 'delivered';
    }

    return this.recordFailure(message, failures.join('; '));
  }

  private async run(
    handler: OutboxHandler,
    message: OutboxMessage,
  ): Promise<void> {
    const delivery: OutboxDelivery = {
      id: message.id,
      name: message.name,
      payload: asPayload(message.payload),
      tenantId: message.tenantId,
      attempt: message.attempts + 1,
      createdAt: message.createdAt,
    };

    if (message.tenantId === null) {
      await handler.handle(delivery);
    } else {
      await runInTenant(message.tenantId, async () => {
        await handler.handle(delivery);
      });
    }

    await authPrismaClient.outboxReceipt.createMany({
      data: [{ messageId: message.id, handler: handler.name }],
      skipDuplicates: true,
    });
  }

  private async recordFailure(
    message: OutboxMessage,
    reason: string,
  ): Promise<'retried' | 'dead'> {
    const attempts = message.attempts + 1;
    const lastError = reason.slice(0, OUTBOX_ERROR_MAX_LENGTH);

    if (attempts >= OUTBOX_MAX_ATTEMPTS) {
      await authPrismaClient.outboxMessage.updateMany({
        where: { id: message.id, status: OUTBOX_STATUS_PENDING },
        data: {
          status: OUTBOX_STATUS_DEAD,
          attempts,
          lastError,
          deadAt: new Date(),
        },
      });
      this.logger.error(
        `Outbox message ${message.id} (${message.name}) is dead after ${attempts} attempts: ${lastError}`,
      );

      return 'dead';
    }

    await authPrismaClient.outboxMessage.updateMany({
      where: { id: message.id, status: OUTBOX_STATUS_PENDING },
      data: {
        attempts,
        lastError,
        nextAttemptAt: new Date(Date.now() + outboxBackoffMs(attempts)),
      },
    });

    return 'retried';
  }
}
