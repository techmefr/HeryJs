import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PageQuery } from '#technical/http/page-query';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { BufferedSink } from './buffered-sink';
import type {
  LogEntry,
  LogFilter,
  LogRecord,
  QueryableLogDriver,
} from './log-driver';

export const SYSTEM_TENANT = 'system';

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 1000;
const MAX_BUFFERED = 5000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_FIELDS_LENGTH = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LogRetention {
  retentionDays: number;
  maxEntriesPerTenant: number;
}

function fieldsOf(entry: LogEntry): Prisma.InputJsonValue {
  const serialised = JSON.stringify(entry.fields);

  return serialised.length > MAX_FIELDS_LENGTH
    ? { truncated: true }
    : (entry.fields as Prisma.InputJsonValue);
}

/**
 * The persisted store, and the one driver the query route can read. App-enforced
 * rather than extension-scoped like IdempotencyKey: the writer is a timer
 * flushing a buffer, with no request around it, so every row carries the tenant
 * it was logged under and every read is bounded by the caller's.
 *
 * It never logs through the logger. A failure writing a log line that was itself
 * logged would be a failure that logs, and the sink reports on stderr instead.
 */
@Injectable()
export class DatabaseLogDriver implements QueryableLogDriver {
  private readonly sink: BufferedSink;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {
    this.sink = new BufferedSink({
      driver: 'database',
      batchSize: BATCH_SIZE,
      flushIntervalMs: FLUSH_INTERVAL_MS,
      maxBuffered: MAX_BUFFERED,
      send: (batch) => this.insert(batch),
    });
  }

  write(entry: LogEntry): void {
    this.sink.push(entry);
  }

  flush(): Promise<void> {
    return this.sink.flush();
  }

  close(): Promise<void> {
    return this.sink.flush();
  }

  async query(
    tenantId: string,
    filter: LogFilter,
    page: PageQuery,
  ): Promise<{ records: LogRecord[]; total: number }> {
    const where: Prisma.LogEntryWhereInput = {
      tenantId,
      ...(filter.level === null ? {} : { level: filter.level }),
      ...(filter.from === null && filter.to === null
        ? {}
        : {
            loggedAt: {
              ...(filter.from === null ? {} : { gte: filter.from }),
              ...(filter.to === null ? {} : { lte: filter.to }),
            },
          }),
      ...(filter.text === null
        ? {}
        : { message: { contains: filter.text, mode: 'insensitive' } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.logEntry.findMany({
        where,
        orderBy: [{ loggedAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.logEntry.count({ where }),
    ]);

    return {
      records: rows.map((row) => ({
        id: row.id,
        time: row.loggedAt,
        level: row.level,
        message: row.message,
        fields: row.fields,
      })),
      total,
    };
  }

  /**
   * Two bounds, because either alone fails: the window keeps a quiet tenant's
   * lines from living forever, and the per-tenant cap keeps one chatty tenant
   * from filling the table inside the window or pushing a quiet tenant's recent
   * lines out, which a single global cap would.
   */
  async prune(retention: LogRetention): Promise<number> {
    const cutoff = new Date(Date.now() - retention.retentionDays * DAY_MS);
    const expired = await this.prisma.logEntry.deleteMany({
      where: { loggedAt: { lt: cutoff } },
    });

    const crowded = await this.prisma.logEntry.groupBy({
      by: ['tenantId'],
      _count: { _all: true },
      having: { id: { _count: { gt: retention.maxEntriesPerTenant } } },
    });

    let deleted = expired.count;

    for (const { tenantId } of crowded) {
      const oldestKept = await this.prisma.logEntry.findFirst({
        where: { tenantId },
        orderBy: [{ loggedAt: 'desc' }, { id: 'desc' }],
        skip: retention.maxEntriesPerTenant - 1,
        select: { loggedAt: true },
      });

      if (!oldestKept) {
        continue;
      }

      const trimmed = await this.prisma.logEntry.deleteMany({
        where: { tenantId, loggedAt: { lt: oldestKept.loggedAt } },
      });

      deleted += trimmed.count;
    }

    return deleted;
  }

  private async insert(batch: LogEntry[]): Promise<void> {
    await this.prisma.logEntry.createMany({
      data: batch.map((entry) => ({
        tenantId: entry.tenantId ?? SYSTEM_TENANT,
        level: entry.level,
        message: entry.message.slice(0, MAX_MESSAGE_LENGTH),
        fields: fieldsOf(entry),
        loggedAt: entry.time,
      })),
    });
  }
}
