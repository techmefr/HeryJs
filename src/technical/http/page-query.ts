import { z } from 'zod';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { ok } from './envelope';

/**
 * The page sizes every route this framework writes itself accepts. A generated
 * resource declares its own in its blueprint, because bounding a business
 * collection is a product decision; the kernel's own collections are our code,
 * so they answer to one convention instead of asking the developer to pick one
 * per route before the route is usable.
 */
export const PAGE_LIMITS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_LIMIT = 25;

const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export interface PageQuery {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface Page<T> {
  records: T[];
  total: number;
}

/**
 * Query-string rather than a body: these are GET routes. A page size outside
 * PAGE_LIMITS is rejected with the same `query.invalid` code a generated
 * resource uses, so a client handles both the same way.
 */
export function parsePageQuery(query: unknown): PageQuery {
  const parsed = pageQuerySchema.safeParse(query ?? {});

  if (!parsed.success) {
    throw new InvalidQueryException('page', PAGE_LIMITS);
  }

  const limit = parsed.data.limit ?? DEFAULT_PAGE_LIMIT;

  if (!PAGE_LIMITS.includes(limit as (typeof PAGE_LIMITS)[number])) {
    throw new InvalidQueryException('limit', PAGE_LIMITS);
  }

  const page = parsed.data.page ?? 1;

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/**
 * The same meta a generated resource's search route reports, so a client reads
 * one shape whether the collection came from a blueprint or from the kernel.
 */
export function okPage<
  T,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(page: Page<T>, query: PageQuery, extra?: TExtra) {
  return ok(page.records, {
    ...(extra ?? ({} as TExtra)),
    page: query.page,
    limit: query.limit,
    total: page.total,
    last_page: Math.max(1, Math.ceil(page.total / query.limit)),
  });
}
