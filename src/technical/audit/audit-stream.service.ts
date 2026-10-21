import { Injectable } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { stageOutboxMessages } from '#technical/outbox/outbox-stage';
import {
  AUDIT_STREAM_BATCH_SIZE,
  AUDIT_STREAM_MESSAGE,
} from './audit-sink.constants';

const MAX_BATCHES_PER_RUN = 10;

export interface AuditStreamPayload extends Record<string, unknown> {
  sinkId: string;
  tenantId: string;
  fromSequence: number;
  toSequence: number;
}

/**
 * Hands the entries a sink has not seen to the outbox, and nothing more. The
 * sink's cursor moves in the same transaction that stages the delivery, so an
 * entry is staged exactly once per sink: a crash before the commit leaves both
 * untouched, a crash after it leaves a staged message the relay will retry.
 *
 * Reading the chain by sequence is safe for a stream because a tenant's
 * entries are appended under an advisory lock held until commit -- within one
 * tenant, a higher sequence is never visible before a lower one.
 *
 * Staging a range rather than the entries keeps the outbox row small and keeps
 * the entries out of a second table: the handler reads them from the chain at
 * delivery, which is also the copy that cannot have drifted.
 */
@Injectable()
export class AuditStreamService {
  async streamAll(): Promise<number> {
    const sinks = await authPrismaClient.auditSink.findMany({
      where: { active: true },
      select: { id: true },
    });
    let staged = 0;

    for (const sink of sinks) {
      staged += await this.streamSink(sink.id);
    }

    return staged;
  }

  async streamSink(sinkId: string): Promise<number> {
    let staged = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      if (!(await this.stageNextBatch(sinkId))) {
        break;
      }

      staged += 1;
    }

    return staged;
  }

  private stageNextBatch(sinkId: string): Promise<boolean> {
    return authPrismaClient.$transaction(async (tx) => {
      const sink = await tx.auditSink.findUnique({ where: { id: sinkId } });

      if (!sink?.active) {
        return false;
      }

      const entries = await tx.auditLog.findMany({
        where: { tenantId: sink.tenantId, sequence: { gt: sink.cursor } },
        orderBy: { sequence: 'asc' },
        take: AUDIT_STREAM_BATCH_SIZE,
        select: { sequence: true },
      });
      const first = entries[0];
      const last = entries[entries.length - 1];

      if (!first || !last) {
        return false;
      }

      const { count } = await tx.auditSink.updateMany({
        where: { id: sink.id, cursor: sink.cursor },
        data: { cursor: last.sequence },
      });

      if (count !== 1) {
        return false;
      }

      const payload: AuditStreamPayload = {
        sinkId: sink.id,
        tenantId: sink.tenantId,
        fromSequence: first.sequence,
        toSequence: last.sequence,
      };

      await stageOutboxMessages(tx, [
        {
          name: AUDIT_STREAM_MESSAGE,
          payload,
          tenantId: sink.tenantId,
        },
      ]);

      return true;
    });
  }
}
