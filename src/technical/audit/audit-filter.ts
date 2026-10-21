import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

const MAX_FILTER_LENGTH = 200;

const filterText = z.string().min(1).max(MAX_FILTER_LENGTH);

const auditFilterSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    model: filterText.optional(),
    operation: filterText.optional(),
    recordId: filterText.optional(),
    userId: filterText.optional(),
  })
  .refine((filter) => !filter.from || !filter.to || filter.from <= filter.to, {
    path: ['from'],
  });

export type AuditFilter = z.infer<typeof auditFilterSchema>;

/**
 * The same filter on the browsable list and on the export, so what an operator
 * sees on screen is exactly what the file will hold. A value that does not
 * parse is refused with the `query.invalid` key every other rejected parameter
 * uses, instead of becoming an empty result that reads as "nothing happened".
 */
export function parseAuditFilter(query: unknown): AuditFilter {
  const parsed = auditFilterSchema.safeParse(query ?? {});

  if (!parsed.success) {
    const [issue] = parsed.error.issues;

    throw new InvalidQueryException(String(issue?.path[0] ?? 'filter'), [
      'from <= to',
      'ISO 8601 dates',
    ]);
  }

  return parsed.data;
}

export function auditWhere(
  tenantId: string,
  filter: AuditFilter,
): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};

  if (filter.from) {
    createdAt.gte = filter.from;
  }

  if (filter.to) {
    createdAt.lte = filter.to;
  }

  return {
    tenantId,
    ...(filter.from || filter.to ? { createdAt } : {}),
    ...(filter.model ? { model: filter.model } : {}),
    ...(filter.operation ? { operation: filter.operation } : {}),
    ...(filter.recordId ? { recordId: filter.recordId } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
  };
}
