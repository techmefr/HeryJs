import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { parsePageQuery } from '#technical/http/page-query';
import type { PageQuery } from '#technical/http/page-query';
import { LOG_LEVELS } from './log-driver';
import type { LogFilter, LogRecord } from './log-driver';
import { LogDriverRegistry } from './log-driver.registry';
import { LogQueryUnavailableException } from './log-query-unavailable.exception';

const MAX_TEXT_LENGTH = 200;

const filterSchema = z.object({
  level: z.enum(LOG_LEVELS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  text: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
});

export interface ParsedLogQuery {
  filter: LogFilter;
  page: PageQuery;
}

export function parseLogQuery(query: unknown): ParsedLogQuery {
  const parsed = filterSchema.safeParse(query ?? {});

  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? 'query');

    throw new InvalidQueryException(
      field,
      field === 'level'
        ? LOG_LEVELS
        : field === 'text'
          ? [`1 to ${MAX_TEXT_LENGTH} characters`]
          : ['an ISO 8601 date'],
    );
  }

  return {
    filter: {
      level: parsed.data.level ?? null,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      text: parsed.data.text ?? null,
    },
    page: parsePageQuery(query),
  };
}

@Injectable()
export class LogService {
  constructor(private readonly drivers: LogDriverRegistry) {}

  query(
    tenantId: string,
    query: ParsedLogQuery,
  ): Promise<{ records: LogRecord[]; total: number }> {
    const reader = this.drivers.reader;

    if (!reader) {
      throw new LogQueryUnavailableException();
    }

    return reader.query(tenantId, query.filter, query.page);
  }
}
