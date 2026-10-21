import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { PageQuery } from '#technical/http/page-query';
import { TelemetryBus } from '#technical/tracing/telemetry-bus';
import { DEV_DASHBOARD_KINDS } from './dev-dashboard.types';
import type {
  DevDashboardKind,
  NewDevDashboardEntry,
} from './dev-dashboard.types';

const HOUR_MS = 60 * 60 * 1000;

export interface DevDashboardEntryRow {
  id: string;
  kind: string;
  label: string;
  status: string | null;
  durationMs: number | null;
  requestId: string | null;
  detail: Prisma.JsonValue;
  createdAt: Date;
}

export interface DevDashboardFilter {
  kind: DevDashboardKind | null;
  minDurationMs: number | null;
}

export type DevDashboardSummary = Record<DevDashboardKind, number>;

export interface DevDashboardRetention {
  retentionHours: number;
  maxEntriesPerTenant: number;
}

/**
 * Reads are always bounded by a tenant the caller passes in, and writes carry
 * the tenant each entry was recorded under: the table is app-enforced rather
 * than extension-scoped because the writer is a timer flushing a buffer, with
 * no request around it to read a tenant from.
 *
 * Everything that touches the database here runs muted. The Prisma client
 * reports every statement it executes, and a store that persists what it hears
 * would otherwise hear itself.
 */
@Injectable()
export class DevDashboardStore {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  insertMany(entries: NewDevDashboardEntry[]): Promise<void> {
    if (entries.length === 0) {
      return Promise.resolve();
    }

    return TelemetryBus.runMuted(async () => {
      await this.prisma.devtoolsEntry.createMany({
        data: entries.map((entry) => ({
          ...entry,
          detail: entry.detail ?? undefined,
        })),
      });
    });
  }

  list(
    tenantId: string,
    filter: DevDashboardFilter,
    page: PageQuery,
  ): Promise<{ records: DevDashboardEntryRow[]; total: number }> {
    const where: Prisma.DevtoolsEntryWhereInput = {
      tenantId,
      ...(filter.kind === null ? {} : { kind: filter.kind }),
      ...(filter.minDurationMs === null
        ? {}
        : { durationMs: { gte: filter.minDurationMs } }),
    };

    return TelemetryBus.runMuted(async () => {
      const [records, total] = await Promise.all([
        this.prisma.devtoolsEntry.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: page.skip,
          take: page.take,
          select: {
            id: true,
            kind: true,
            label: true,
            status: true,
            durationMs: true,
            requestId: true,
            detail: true,
            createdAt: true,
          },
        }),
        this.prisma.devtoolsEntry.count({ where }),
      ]);

      return { records, total };
    });
  }

  summary(tenantId: string): Promise<DevDashboardSummary> {
    return TelemetryBus.runMuted(async () => {
      const groups = await this.prisma.devtoolsEntry.groupBy({
        by: ['kind'],
        where: { tenantId },
        _count: { _all: true },
      });
      const counts = Object.fromEntries(
        DEV_DASHBOARD_KINDS.map((kind) => [kind, 0]),
      ) as DevDashboardSummary;

      for (const group of groups) {
        const kind = DEV_DASHBOARD_KINDS.find((known) => known === group.kind);

        if (kind) {
          counts[kind] = group._count._all;
        }
      }

      return counts;
    });
  }

  clear(tenantId: string): Promise<number> {
    return TelemetryBus.runMuted(async () => {
      const { count } = await this.prisma.devtoolsEntry.deleteMany({
        where: { tenantId },
      });

      return count;
    });
  }

  /**
   * Two bounds, because either alone fails: a window keeps a quiet tenant's
   * rows from living forever, and a per-tenant cap keeps one noisy tenant from
   * filling the table inside the window or pushing a quiet tenant's recent rows
   * out, which a single global cap would.
   */
  prune(retention: DevDashboardRetention): Promise<number> {
    return TelemetryBus.runMuted(async () => {
      const cutoff = new Date(Date.now() - retention.retentionHours * HOUR_MS);
      const expired = await this.prisma.devtoolsEntry.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      const crowded = await this.prisma.devtoolsEntry.groupBy({
        by: ['tenantId'],
        _count: { _all: true },
        having: { id: { _count: { gt: retention.maxEntriesPerTenant } } },
      });

      let deleted = expired.count;

      for (const { tenantId } of crowded) {
        const oldestKept = await this.prisma.devtoolsEntry.findFirst({
          where: { tenantId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: retention.maxEntriesPerTenant - 1,
          select: { createdAt: true },
        });

        if (!oldestKept) {
          continue;
        }

        const trimmed = await this.prisma.devtoolsEntry.deleteMany({
          where: { tenantId, createdAt: { lt: oldestKept.createdAt } },
        });

        deleted += trimmed.count;
      }

      return deleted;
    });
  }
}
