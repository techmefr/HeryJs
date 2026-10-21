import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { parsePageQuery } from '#technical/http/page-query';
import type { PageQuery } from '#technical/http/page-query';
import { DevDashboardStore } from './dev-dashboard.store';
import type {
  DevDashboardEntryRow,
  DevDashboardFilter,
  DevDashboardSummary,
} from './dev-dashboard.store';
import { DEV_DASHBOARD_KINDS } from './dev-dashboard.types';

const filterSchema = z.object({
  kind: z.enum(DEV_DASHBOARD_KINDS).optional(),
  minDurationMs: z.coerce.number().nonnegative().optional(),
});

export interface ParsedDashboardQuery {
  filter: DevDashboardFilter;
  page: PageQuery;
}

export function parseDashboardQuery(query: unknown): ParsedDashboardQuery {
  const parsed = filterSchema.safeParse(query ?? {});

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];

    throw new InvalidQueryException(
      String(field ?? 'query'),
      field === 'kind'
        ? DEV_DASHBOARD_KINDS
        : ['a number of milliseconds >= 0'],
    );
  }

  return {
    filter: {
      kind: parsed.data.kind ?? null,
      minDurationMs: parsed.data.minDurationMs ?? null,
    },
    page: parsePageQuery(query),
  };
}

@Injectable()
export class DevDashboardService {
  constructor(private readonly store: DevDashboardStore) {}

  list(
    tenantId: string,
    query: ParsedDashboardQuery,
  ): Promise<{ records: DevDashboardEntryRow[]; total: number }> {
    return this.store.list(tenantId, query.filter, query.page);
  }

  summary(tenantId: string): Promise<DevDashboardSummary> {
    return this.store.summary(tenantId);
  }

  clear(tenantId: string): Promise<number> {
    return this.store.clear(tenantId);
  }
}
