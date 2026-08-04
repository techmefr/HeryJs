import { z } from 'zod';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

export const FILTER_OPERATORS = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'like',
  'not like',
  'in',
  'not in',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const MAX_FILTER_DEPTH = 3;

const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
]);

export interface FilterEntry {
  field?: string;
  operator?: FilterOperator;
  value?: string | number | boolean | (string | number)[];
  type?: 'and' | 'or';
  nested?: FilterEntry[];
}

const filterEntrySchema: z.ZodType<FilterEntry> = z.lazy(() =>
  z.object({
    field: z.string().optional(),
    operator: z.enum(FILTER_OPERATORS).optional(),
    value: filterValueSchema.optional(),
    type: z.enum(['and', 'or']).optional(),
    nested: z.array(filterEntrySchema).optional(),
  }),
);

const sortEntrySchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

const selectEntrySchema = z.object({ field: z.string() });

export type SortEntry = z.infer<typeof sortEntrySchema>;
export type SelectEntry = z.infer<typeof selectEntrySchema>;

export const searchRequestSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().optional(),
  sorts: z.array(sortEntrySchema).optional(),
  filters: z.array(filterEntrySchema).optional(),
  selects: z.array(selectEntrySchema).optional(),
  search: z
    .object({ q: z.string().optional(), engine: z.string().optional() })
    .optional(),
  withTrashed: z.boolean().optional(),
  onlyTrashed: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
});

export type SearchRequestBody = z.infer<typeof searchRequestSchema>;

export interface ListQueryContract {
  sorts: readonly string[];
  filters: readonly string[];
  selects: readonly string[];
  limits: readonly number[];
  defaultLimit: number;
}

export interface ParsedListQuery {
  withTrashed: boolean;
  onlyTrashed: boolean;
  sorts?: SortEntry[];
  where?: Record<string, unknown>;
  select?: Record<string, true>;
  search?: string;
  searchEngine?: string;
  page: number;
  limit: number;
}

function operatorFragment(
  operator: FilterOperator,
  value: FilterEntry['value'],
): Record<string, unknown> {
  switch (operator) {
    case '=':
      return { equals: value };
    case '!=':
      return { not: value };
    case '>':
      return { gt: value };
    case '>=':
      return { gte: value };
    case '<':
      return { lt: value };
    case '<=':
      return { lte: value };
    case 'like':
      return { contains: value };
    case 'not like':
      return { not: { contains: value } };
    case 'in':
      return { in: value };
    case 'not in':
      return { notIn: value };
  }
}

function buildFilterEntry(
  entry: FilterEntry,
  contract: ListQueryContract,
  depth: number,
): Record<string, unknown> {
  if (entry.nested) {
    return buildFilterWhere(entry.nested, contract, depth + 1);
  }

  if (!entry.field || !contract.filters.includes(entry.field)) {
    throw new InvalidQueryException('filters', contract.filters);
  }

  const operator = entry.operator ?? '=';

  if (
    (operator === 'in' || operator === 'not in') &&
    !Array.isArray(entry.value)
  ) {
    throw new InvalidQueryException('filters.value', []);
  }

  return { [entry.field]: operatorFragment(operator, entry.value) };
}

function buildFilterWhere(
  entries: FilterEntry[],
  contract: ListQueryContract,
  depth: number,
): Record<string, unknown> {
  if (depth > MAX_FILTER_DEPTH) {
    throw new InvalidQueryException('filters', contract.filters);
  }

  const andGroup: Record<string, unknown>[] = [];
  const orGroup: Record<string, unknown>[] = [];

  for (const entry of entries) {
    const fragment = buildFilterEntry(entry, contract, depth);

    if (entry.type === 'or') {
      orGroup.push(fragment);
    } else {
      andGroup.push(fragment);
    }
  }

  const clauses: Record<string, unknown>[] = [];

  if (andGroup.length > 0) {
    clauses.push({ AND: andGroup });
  }
  if (orGroup.length > 0) {
    clauses.push({ OR: orGroup });
  }

  return clauses.length === 1 ? clauses[0]! : { AND: clauses };
}

function parseSorts(
  sorts: SortEntry[] | undefined,
  contract: ListQueryContract,
): SortEntry[] | undefined {
  if (!sorts || sorts.length === 0) {
    return undefined;
  }

  for (const sort of sorts) {
    if (!contract.sorts.includes(sort.field)) {
      throw new InvalidQueryException('sorts', contract.sorts);
    }
  }

  return sorts;
}

function parseSelects(
  selects: SelectEntry[] | undefined,
  contract: ListQueryContract,
): Record<string, true> | undefined {
  if (!selects || selects.length === 0) {
    return undefined;
  }

  const select: Record<string, true> = {};

  for (const entry of selects) {
    if (!contract.selects.includes(entry.field)) {
      throw new InvalidQueryException('selects', contract.selects);
    }

    select[entry.field] = true;
  }

  return select;
}

export function parseSearchRequest(
  body: SearchRequestBody,
  contract: ListQueryContract,
): ParsedListQuery {
  const limit = body.limit ?? contract.defaultLimit;

  if (!contract.limits.includes(limit)) {
    throw new InvalidQueryException('limit', contract.limits);
  }

  const page = body.page ?? 1;
  const sorts = parseSorts(body.sorts, contract);
  const select = parseSelects(body.selects, contract);
  const where =
    body.filters && body.filters.length > 0
      ? buildFilterWhere(body.filters, contract, 1)
      : undefined;

  const search = body.search?.q?.trim();
  const searchEngine = body.search?.engine?.trim();

  return {
    withTrashed: body.withTrashed === true,
    onlyTrashed: body.onlyTrashed === true,
    sorts,
    where,
    select,
    search: search ? search : undefined,
    searchEngine: searchEngine ? searchEngine : undefined,
    page,
    limit,
  };
}
