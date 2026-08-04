import { z } from 'zod';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

export interface ListQueryContract {
  sorts: readonly string[];
  filters: readonly string[];
  limits: readonly number[];
  defaultLimit: number;
}

/**
 * The same shape for every generated resource -- the allow-list check that
 * makes a field name valid for a specific resource happens downstream in
 * parseSearchRequest, against that resource's own contract. Defined once here
 * rather than emitted per resource by the generator, since duplicating an
 * identical schema into every controller would be pure repetition with
 * nothing resource-specific to justify it.
 *
 * `filters` is `z.record(z.string(), z.string())` rather than
 * `z.record(z.string(), z.unknown())`: a POST body carries arbitrary JSON, and
 * without this an object value would be spread into the Prisma `where`
 * clause as an operator instead of the documented plain equality check.
 */
export const searchRequestSchema = z.object({
  limit: z.number().int().optional(),
  sort: z.string().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  search: z
    .object({ q: z.string().optional(), engine: z.string().optional() })
    .optional(),
  withTrashed: z.boolean().optional(),
  onlyTrashed: z.boolean().optional(),
  // Which per-record capability decisions to attach to each result -- the
  // caller names them explicitly rather than always getting every preset
  // the resource has, the same way `filters` names which fields it wants to
  // narrow on rather than exposing every column.
  capabilities: z.array(z.string()).optional(),
});

export type SearchRequestBody = z.infer<typeof searchRequestSchema>;

export interface ParsedListQuery {
  withTrashed: boolean;
  onlyTrashed: boolean;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: Record<string, string>;
  search?: string;
  searchEngine?: string;
  limit: number;
}

export function parseSearchRequest(
  body: SearchRequestBody,
  contract: ListQueryContract,
): ParsedListQuery {
  const limit = body.limit ?? contract.defaultLimit;

  if (!contract.limits.includes(limit)) {
    throw new InvalidQueryException('limit', contract.limits);
  }

  let sort: ParsedListQuery['sort'];

  if (body.sort) {
    const field = body.sort.replace(/^-/, '');

    if (!contract.sorts.includes(field)) {
      throw new InvalidQueryException('sort', contract.sorts);
    }

    sort = { field, direction: body.sort.startsWith('-') ? 'desc' : 'asc' };
  }

  const filters: Record<string, string> = {};

  for (const [field, value] of Object.entries(body.filters ?? {})) {
    if (!contract.filters.includes(field) || typeof value !== 'string') {
      throw new InvalidQueryException('filters', contract.filters);
    }

    filters[field] = value;
  }

  const search = body.search?.q?.trim();
  const searchEngine = body.search?.engine?.trim();

  return {
    withTrashed: body.withTrashed === true,
    onlyTrashed: body.onlyTrashed === true,
    sort,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    search: search ? search : undefined,
    searchEngine: searchEngine ? searchEngine : undefined,
    limit,
  };
}
