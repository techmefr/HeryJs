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

// count/exists on a hasMany relation resolve through Prisma's own filtered
// `_count`, in the same query as the page itself. Nothing else can: Prisma
// has no inline avg/sum/min/max on a relation, and no relation at all for a
// morphMany target (it does not model polymorphic associations), so those
// are resolved by the service as one extra batched query per aggregate,
// keyed back to the page by foreignKey -- see RelationInstruction below.
export const AGGREGATE_TYPES = [
  'count',
  'exists',
  'avg',
  'sum',
  'min',
  'max',
] as const;
export type AggregateType = (typeof AGGREGATE_TYPES)[number];

const AGGREGATE_TYPES_NEEDING_FIELD = new Set<AggregateType>([
  'avg',
  'sum',
  'min',
  'max',
]);

// Prisma object key rules, not a display label: this becomes the property
// name the client reads the include/aggregate result off of.
const ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const aliasSchema = z.string().max(255).regex(ALIAS_PATTERN).optional();

export interface AggregateEntry {
  relation: string;
  type: AggregateType;
  field?: string;
  alias?: string;
  filters?: FilterEntry[];
}

const aggregateEntrySchema: z.ZodType<AggregateEntry> = z.object({
  relation: z.string(),
  type: z.enum(AGGREGATE_TYPES),
  field: z.string().optional(),
  alias: aliasSchema,
  filters: z.array(filterEntrySchema).optional(),
});

// One level deep: an include may filter/sort/select/paginate the relation it
// loads, but it cannot itself carry a further include or aggregate. See
// blueprint.ts's blueprintRelationLinkSchema for why that bound is where it is.
export interface IncludeEntry {
  relation: string;
  alias?: string;
  filters?: FilterEntry[];
  sorts?: SortEntry[];
  selects?: SelectEntry[];
  limit?: number;
}

const includeEntrySchema: z.ZodType<IncludeEntry> = z.object({
  relation: z.string(),
  alias: aliasSchema,
  filters: z.array(filterEntrySchema).optional(),
  sorts: z.array(sortEntrySchema).optional(),
  selects: z.array(selectEntrySchema).optional(),
  limit: z.number().int().positive().optional(),
});

export const searchRequestSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().optional(),
  sorts: z.array(sortEntrySchema).optional(),
  filters: z.array(filterEntrySchema).optional(),
  selects: z.array(selectEntrySchema).optional(),
  includes: z.array(includeEntrySchema).optional(),
  aggregates: z.array(aggregateEntrySchema).optional(),
  search: z
    .object({ q: z.string().optional(), engine: z.string().optional() })
    .optional(),
  withTrashed: z.boolean().optional(),
  onlyTrashed: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
});

export type SearchRequestBody = z.infer<typeof searchRequestSchema>;

// What buildFilterWhere/parseSorts/parseSelects actually need -- both the
// resource's own contract and a single relation's nested contract satisfy
// this shape, so the same three functions validate both without a cast.
export interface FieldContract {
  filters: readonly string[];
  sorts: readonly string[];
  selects: readonly string[];
}

export type RelationType = 'hasMany' | 'morphMany';

// Everything needed to actually reach the related rows. hasMany is a real
// Prisma relation, so foreignKey is informational for the manual paths only
// (count/exists/native includes go through Prisma's own `include`, which
// already knows how the relation is wired). morphMany has none of that --
// discriminator/discriminatorValue are what let a manual query find "the
// rows on the other side that point at me", the same job a Prisma relation
// would otherwise do.
export interface RelationContract {
  type: RelationType;
  foreignKey: string;
  discriminator?: string;
  discriminatorValue?: string;
  childDelegate: string;
}

export interface IncludeContract extends FieldContract, RelationContract {}

export interface AggregateContract extends RelationContract {
  filters: readonly string[];
  fields: readonly string[];
}

export interface ListQueryContract extends FieldContract {
  limits: readonly number[];
  defaultLimit: number;
  includes?: Record<string, IncludeContract>;
  aggregates?: Record<string, AggregateContract>;
}

interface RelationInstructionBase {
  relation: string;
  relationType: RelationType;
  foreignKey: string;
  discriminator?: string;
  discriminatorValue?: string;
  childDelegate: string;
  where?: Record<string, unknown>;
}

export interface IncludeInstruction extends RelationInstructionBase {
  kind: 'include';
  orderBy?: Record<string, 'asc' | 'desc'>[];
  select?: Record<string, true>;
}

export interface AggregateInstruction extends RelationInstructionBase {
  kind: 'aggregate';
  aggregateType: AggregateType;
  field?: string;
  // Two aggregate types on the same relation (a hasMany `count` reaching
  // Prisma's native `_count` and an `avg` on that same relation going through
  // this manual path) would otherwise collide in `_aggregates`, each
  // overwriting the other's value. This is the manual path's own slot,
  // distinct from the bare relation name the native `_count` bucket uses.
  aggregateKey: string;
}

// What parseSearchRequest could not resolve into Prisma's own `include`
// clause -- the service runs each of these itself, one batched query across
// the whole page (never per row), and merges the result back onto the
// matching parent by foreignKey before the controller ever sees the record.
export type RelationInstruction = IncludeInstruction | AggregateInstruction;

export interface IncludeManifestEntry {
  key: string;
  relation: string;
}

export interface AggregateManifestEntry {
  key: string;
  relation: string;
  type: AggregateType;
  // Where to read the resolved value from `_aggregates`: the bare relation
  // name for a native `_count` bucket (shared by that relation's count and
  // exists entries), or the manual path's own per-type key otherwise. See
  // AggregateInstruction.aggregateKey.
  bucketKey: string;
}

export interface ParsedListQuery {
  withTrashed: boolean;
  onlyTrashed: boolean;
  sorts?: SortEntry[];
  where?: Record<string, unknown>;
  select?: Record<string, true>;
  include?: Record<string, unknown>;
  relationInstructions?: RelationInstruction[];
  includeManifest?: IncludeManifestEntry[];
  aggregateManifest?: AggregateManifestEntry[];
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
  contract: Pick<FieldContract, 'filters'>,
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
  contract: Pick<FieldContract, 'filters'>,
  depth: number,
): Record<string, unknown> {
  if (depth > MAX_FILTER_DEPTH) {
    throw new InvalidQueryException('filters', contract.filters);
  }

  // An `or` entry opens a new group, and every entry after it (until the
  // next `or`) joins that group with AND: [A, B(or), C] reads as
  // A OR (B AND C), not "(A OR B) then AND C".
  const groups: Record<string, unknown>[][] = [];

  for (const entry of entries) {
    const fragment = buildFilterEntry(entry, contract, depth);

    if (entry.type === 'or' && groups.length > 0) {
      groups.push([fragment]);
    } else {
      if (groups.length === 0) {
        groups.push([]);
      }
      groups[groups.length - 1]!.push(fragment);
    }
  }

  const branches = groups.map((group) =>
    group.length === 1 ? group[0]! : { AND: group },
  );

  return branches.length === 1 ? branches[0]! : { OR: branches };
}

function parseSorts(
  sorts: SortEntry[] | undefined,
  contract: FieldContract,
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
  contract: FieldContract,
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

/**
 * An alias that collides with another include, another aggregate, or one of
 * the resource's own selectable fields would silently overwrite a key in the
 * response the caller did not ask to lose.
 */
function claimAlias(name: string, claimed: Set<string>): string {
  if (claimed.has(name)) {
    throw new InvalidQueryException('alias', []);
  }

  claimed.add(name);
  return name;
}

function buildIncludeClause(
  entries: IncludeEntry[] | undefined,
  contract: ListQueryContract,
  claimed: Set<string>,
):
  | {
      nativeInclude: Record<string, unknown>;
      instructions: RelationInstruction[];
      manifest: IncludeManifestEntry[];
    }
  | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const includable = contract.includes ?? {};
  const nativeInclude: Record<string, unknown> = {};
  const instructions: RelationInstruction[] = [];
  const manifest: IncludeManifestEntry[] = [];

  for (const entry of entries) {
    const relationContract = includable[entry.relation];

    if (!relationContract) {
      throw new InvalidQueryException('includes', Object.keys(includable));
    }

    const key = claimAlias(entry.alias ?? entry.relation, claimed);
    const where =
      entry.filters && entry.filters.length > 0
        ? buildFilterWhere(entry.filters, relationContract, 1)
        : undefined;
    const sorts = parseSorts(entry.sorts, relationContract);
    const select = parseSelects(entry.selects, relationContract);
    const orderBy = sorts?.map((sort) => ({ [sort.field]: sort.direction }));

    if (relationContract.type === 'morphMany') {
      // Prisma has no relation to attach a nested `include` to here, so this
      // cannot be limited per parent the way a native relation can -- the
      // service resolves it as one extra query across the whole page.
      if (entry.limit) {
        throw new InvalidQueryException('includes.limit', []);
      }

      instructions.push({
        kind: 'include',
        relation: entry.relation,
        relationType: 'morphMany',
        foreignKey: relationContract.foreignKey,
        discriminator: relationContract.discriminator,
        discriminatorValue: relationContract.discriminatorValue,
        childDelegate: relationContract.childDelegate,
        where,
        orderBy,
        select,
      });
    } else {
      nativeInclude[entry.relation] = {
        ...(where ? { where } : {}),
        ...(orderBy ? { orderBy } : {}),
        ...(select ? { select } : {}),
        ...(entry.limit ? { take: entry.limit } : {}),
      };
    }

    manifest.push({ key, relation: entry.relation });
  }

  return { nativeInclude, instructions, manifest };
}

function buildAggregateSelect(
  entries: AggregateEntry[] | undefined,
  contract: ListQueryContract,
  claimed: Set<string>,
):
  | {
      nativeCountSelect: Record<string, unknown>;
      instructions: RelationInstruction[];
      manifest: AggregateManifestEntry[];
    }
  | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const aggregatable = contract.aggregates ?? {};
  const nativeCountSelect: Record<string, unknown> = {};
  const instructions: RelationInstruction[] = [];
  const manifest: AggregateManifestEntry[] = [];

  for (const entry of entries) {
    const relationContract = aggregatable[entry.relation];

    if (!relationContract) {
      throw new InvalidQueryException('aggregates', Object.keys(aggregatable));
    }

    const needsField = AGGREGATE_TYPES_NEEDING_FIELD.has(entry.type);

    if (
      needsField &&
      (!entry.field || !relationContract.fields.includes(entry.field))
    ) {
      throw new InvalidQueryException(
        'aggregates.field',
        relationContract.fields,
      );
    }

    const key = claimAlias(
      entry.alias ?? `${entry.relation}_${entry.type}`,
      claimed,
    );
    const where =
      entry.filters && entry.filters.length > 0
        ? buildFilterWhere(entry.filters, relationContract, 1)
        : undefined;

    // Only a hasMany count/exists reaches Prisma's inline `_count.select`,
    // one query shared with the page itself. Everything else -- avg/sum/min/max
    // on any relation, or any aggregate on a morphMany relation, which Prisma
    // cannot express through `include` at all -- is resolved by the service as
    // its own batched query, keyed back to the page by foreignKey.
    const isNativeCount = relationContract.type === 'hasMany' && !needsField;
    const bucketKey = isNativeCount
      ? entry.relation
      : `${entry.relation}:${entry.type}`;

    if (isNativeCount) {
      nativeCountSelect[entry.relation] = where ? { where } : true;
    } else {
      instructions.push({
        kind: 'aggregate',
        relation: entry.relation,
        aggregateKey: bucketKey,
        aggregateType: entry.type,
        field: entry.field,
        relationType: relationContract.type,
        foreignKey: relationContract.foreignKey,
        discriminator: relationContract.discriminator,
        discriminatorValue: relationContract.discriminatorValue,
        childDelegate: relationContract.childDelegate,
        where,
      });
    }

    manifest.push({
      key,
      relation: entry.relation,
      type: entry.type,
      bucketKey,
    });
  }

  return { nativeCountSelect, instructions, manifest };
}

/**
 * A generated view function only ever emits the resource's own declared
 * fields, by design -- it is the allow-list that keeps a raw Prisma record
 * from leaking. Include data arrives on the raw record under the relation's
 * own name (whether Prisma put it there natively or the service merged it in
 * manually, see resolveRelationInstructions). Aggregate data arrives under
 * `_aggregates`, a bucket the service normalizes to the same shape whether it
 * came from Prisma's native `_count` or a manual batched query -- so this
 * function never needs to know which path produced either one.
 */
export function withIncludesAndAggregates(
  view: Record<string, unknown>,
  record: Record<string, unknown>,
  query: ParsedListQuery,
): Record<string, unknown> {
  if (!query.includeManifest && !query.aggregateManifest) {
    return view;
  }

  const result = { ...view };

  for (const entry of query.includeManifest ?? []) {
    result[entry.key] = record[entry.relation];
  }

  const aggregates = (record._aggregates ?? {}) as Record<
    string,
    number | null
  >;

  for (const entry of query.aggregateManifest ?? []) {
    const value =
      aggregates[entry.bucketKey] ?? (entry.type === 'exists' ? 0 : null);
    result[entry.key] = entry.type === 'exists' ? Number(value) > 0 : value;
  }

  return result;
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

  // Shared across includes and aggregates so an include's alias and an
  // aggregate's alias can never collide with each other either, not just
  // within their own array.
  const claimedAliases = new Set<string>(contract.selects);
  const includeResult = buildIncludeClause(
    body.includes,
    contract,
    claimedAliases,
  );
  const aggregateResult = buildAggregateSelect(
    body.aggregates,
    contract,
    claimedAliases,
  );

  const nativeInclude: Record<string, unknown> = {
    ...(includeResult?.nativeInclude ?? {}),
    ...(aggregateResult &&
    Object.keys(aggregateResult.nativeCountSelect).length > 0
      ? { _count: { select: aggregateResult.nativeCountSelect } }
      : {}),
  };
  const include =
    Object.keys(nativeInclude).length > 0 ? nativeInclude : undefined;

  const relationInstructions = [
    ...(includeResult?.instructions ?? []),
    ...(aggregateResult?.instructions ?? []),
  ];

  const search = body.search?.q?.trim();
  const searchEngine = body.search?.engine?.trim();

  return {
    withTrashed: body.withTrashed === true,
    onlyTrashed: body.onlyTrashed === true,
    sorts,
    where,
    select,
    include,
    relationInstructions:
      relationInstructions.length > 0 ? relationInstructions : undefined,
    includeManifest: includeResult?.manifest,
    aggregateManifest: aggregateResult?.manifest,
    search: search ? search : undefined,
    searchEngine: searchEngine ? searchEngine : undefined,
    page,
    limit,
  };
}
