import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

export interface ListQueryContract {
  sorts: readonly string[];
  filters: readonly string[];
  limits: readonly number[];
  defaultLimit: number;
}

export interface SearchRequestBody {
  limit?: number;
  sort?: string;
  filters?: Record<string, string>;
  search?: { q?: string; engine?: string };
  withTrashed?: boolean;
  onlyTrashed?: boolean;
}

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
    if (!contract.filters.includes(field)) {
      throw new InvalidQueryException('filter', contract.filters);
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
