import { InvalidQueryException } from '../errors/invalid-query.exception';

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

  return {
    withTrashed: query.withTrashed === 'true',
    onlyTrashed: query.onlyTrashed === 'true',
    sort,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    limit,
  };
}
