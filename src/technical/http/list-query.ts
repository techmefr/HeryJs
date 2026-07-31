import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

export interface ListQueryContract {
  sorts: readonly string[];
  filters: readonly string[];
  limits: readonly number[];
  defaultLimit: number;
}

export type RawListQuery = Record<string, string | undefined>;

export interface ParsedListQuery {
  withTrashed: boolean;
  onlyTrashed: boolean;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: Record<string, string>;
  search?: string;
  searchEngine?: string;
  limit: number;
}

const FILTER_KEY_PATTERN = /^filter\[(.+)\]$/;

export function parseListQuery(
  query: RawListQuery,
  contract: ListQueryContract,
): ParsedListQuery {
  const limit = query.limit ? Number(query.limit) : contract.defaultLimit;

  if (!contract.limits.includes(limit)) {
    throw new InvalidQueryException('limit', contract.limits);
  }

  let sort: ParsedListQuery['sort'];

  if (query.sort) {
    const field = query.sort.replace(/^-/, '');

    if (!contract.sorts.includes(field)) {
      throw new InvalidQueryException('sort', contract.sorts);
    }

    sort = { field, direction: query.sort.startsWith('-') ? 'desc' : 'asc' };
  }

  const filters: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    const match = FILTER_KEY_PATTERN.exec(key);
    const field = match?.[1];

    if (!field || value === undefined) {
      continue;
    }

    if (!contract.filters.includes(field)) {
      throw new InvalidQueryException('filter', contract.filters);
    }

    filters[field] = value;
  }

  const search = query.q?.trim();
  // A bracket key rather than a nested body field, consistent with
  // filter[x] above -- the engine keyword lives "in the request's search
  // object" without requiring the term itself (query.q) to move there too,
  // which is a separate, still-open question (Lomkit-style POST body vs.
  // this GET-with-query-string shape) this change does not settle.
  const searchEngine = query['search[engine]']?.trim();

  return {
    withTrashed: query.withTrashed === 'true',
    onlyTrashed: query.onlyTrashed === 'true',
    sort,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    search: search ? search : undefined,
    searchEngine: searchEngine ? searchEngine : undefined,
    limit,
  };
}
