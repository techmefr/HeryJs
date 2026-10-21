import { Injectable, OnModuleInit } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import type {
  OutboxDelivery,
  OutboxHandler,
} from '#technical/outbox/outbox.types';
import {
  AUDIT_SINK_ERROR_MAX_LENGTH,
  AUDIT_SINK_HANDLER,
  AUDIT_STREAM_MESSAGE,
} from './audit-sink.constants';
import { AuditSinkDelivery } from './audit-sink.delivery';

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Delivers one staged range to its sink. A failure is recorded on the sink,
 * where the admin shows it, and then rethrown: the outbox relay owns the
 * retry, the backoff and the dead-letter state, so nothing here counts
 * attempts. A sink deleted since the range was staged has nowhere to deliver
 * to, which is a finished delivery rather than an error to retry eight times.
 */
@Injectable()
export class AuditSinkHandler implements OutboxHandler, OnModuleInit {
  readonly name = AUDIT_SINK_HANDLER;
  readonly names = [AUDIT_STREAM_MESSAGE];

  constructor(
    private readonly outbox: OutboxRegistry,
    private readonly delivery: AuditSinkDelivery,
  ) {}

  onModuleInit(): void {
    this.outbox.register(this);
  }

  async handle(message: OutboxDelivery): Promise<void> {
    const { payload } = message;
    const sinkId = typeof payload.sinkId === 'string' ? payload.sinkId : null;
    const tenantId =
      typeof payload.tenantId === 'string' ? payload.tenantId : null;
    const fromSequence = numberOf(payload.fromSequence);
    const toSequence = numberOf(payload.toSequence);

    if (!sinkId || !tenantId || fromSequence === null || toSequence === null) {
      return;
    }

    const sink = await authPrismaClient.auditSink.findFirst({
      where: { id: sinkId, tenantId },
    });

    if (!sink) {
      return;
    }

    const entries = await authPrismaClient.auditLog.findMany({
      where: { tenantId, sequence: { gte: fromSequence, lte: toSequence } },
      orderBy: { sequence: 'asc' },
    });

    try {
      await this.delivery.send(sink, { fromSequence, toSequence, entries });
    } catch (error) {
      await authPrismaClient.auditSink.updateMany({
        where: { id: sink.id },
        data: {
          lastError: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, AUDIT_SINK_ERROR_MAX_LENGTH),
        },
      });

      throw error;
    }

    await authPrismaClient.auditSink.updateMany({
      where: { id: sink.id },
      data: {
        lastError: null,
        lastDeliveredAt: new Date(),
        lastDeliveredSequence: toSequence,
      },
    });
  }
}
