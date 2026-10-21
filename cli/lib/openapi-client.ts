import type {
  ScalarBlueprintField,
  ResolvedAggregate,
  ResolvedInclude,
} from './blueprint';
import type { ResourceContext } from './resource-context';
import {
  AGGREGATE_TYPES_NEEDING_FIELD,
  AGGREGATE_TYPES_WITHOUT_FIELD,
  OPENAPI_ABSENCES,
  filterableFields,
  nestedIncludesOf,
  operationPrefixOf,
  ownRouteIncludes,
  pascalOf,
  recordProperties,
  selectableFields,
  typeNameOf,
} from './openapi-contract';
import type { RecordProperty } from './openapi-contract';

const FIELD_TS_TYPES: Record<RecordProperty['type'], string> = {
  string: 'string',
  int: 'number',
  boolean: 'boolean',
  datetime: 'string',
  file: 'string',
  encrypted: 'string',
  id: 'string',
  timestamp: 'string',
};

function union(names: readonly string[]): string {
  return names.length === 0
    ? 'never'
    : names.map((name) => `'${name}'`).join(' | ');
}

function inputType(field: ScalarBlueprintField): string {
  return FIELD_TS_TYPES[field.type];
}

function sortEntryType(sorts: readonly string[]): string {
  return `{ field: ${union(sorts)}; direction?: SortDirection }`;
}

function selectEntryType(selects: readonly string[]): string {
  return `{ field: ${union(selects)} }`;
}

function filterDeclaration(name: string, fields: readonly string[]): string {
  return `export type ${name} =
  | { field: ${union(fields)}; operator?: FilterOperator; value?: FilterValue; type?: 'and' | 'or' }
  | { nested: ${name}[]; type?: 'and' | 'or' };`;
}

function includeDeclarations(
  prefix: string,
  includes: readonly ResolvedInclude[],
): { names: string[]; declarations: string[] } {
  const names: string[] = [];
  const declarations: string[] = [];

  for (const include of includes) {
    const name = `${prefix}${pascalOf(include.relation)}`;
    const nested = includeDeclarations(name, nestedIncludesOf(include));
    names.push(`${name}Include`);
    declarations.push(
      filterDeclaration(`${name}Filter`, ['id', ...include.filters]),
      ...nested.declarations,
      `export interface ${name}Include {
  relation: '${include.relation}';
  alias?: string;
  filters?: ${name}Filter[];
  sorts?: Array<${sortEntryType(include.sorts)}>;
  selects?: Array<${selectEntryType(include.selects)}>;${include.type === 'hasMany' ? '\n  limit?: number;' : ''}${nested.names.length > 0 ? `\n  includes?: Array<${nested.names.join(' | ')}>;` : ''}
}`,
    );
  }

  return { names, declarations };
}

function aggregateDeclarations(
  prefix: string,
  aggregates: readonly ResolvedAggregate[],
): { names: string[]; declarations: string[] } {
  const names: string[] = [];
  const declarations: string[] = [];

  for (const aggregate of aggregates) {
    const name = `${prefix}Aggregate${pascalOf(aggregate.relation)}`;
    declarations.push(
      filterDeclaration(`${name}Filter`, ['id', ...aggregate.filters]),
    );
    names.push(`${name}Count`);
    declarations.push(`export interface ${name}Count {
  relation: '${aggregate.relation}';
  type: ${union(AGGREGATE_TYPES_WITHOUT_FIELD)};
  alias?: string;
  filters?: ${name}Filter[];
}`);

    if (aggregate.fields.length > 0) {
      names.push(`${name}Measure`);
      declarations.push(`export interface ${name}Measure {
  relation: '${aggregate.relation}';
  type: ${union(AGGREGATE_TYPES_NEEDING_FIELD)};
  field: ${union(aggregate.fields)};
  alias?: string;
  filters?: ${name}Filter[];
}`);
    }
  }

  return { names, declarations };
}

function paginationMembers(pagination: ResourceContext['pagination']): string {
  return pagination
    ? `  page?: number;\n  limit?: ${pagination.limits.join(' | ')};`
    : '  page?: never;\n  limit?: never;';
}

function trashMembers(ctx: ResourceContext): string {
  return ctx.softDeletes
    ? '  withTrashed?: boolean;\n  onlyTrashed?: boolean;'
    : '  withTrashed?: never;\n  onlyTrashed?: never;';
}

function recordInterface(ctx: ResourceContext): string {
  const name = typeNameOf(ctx);
  const lines = recordProperties(ctx).map(
    (property) =>
      `  ${property.name}: ${FIELD_TS_TYPES[property.type]}${property.optional ? ' | null' : ''};`,
  );

  return `export interface ${name} {\n${lines.join('\n')}\n}`;
}

function queryDeclarations(ctx: ResourceContext): string {
  const name = typeNameOf(ctx);
  const selects = selectableFields(ctx);
  const includes = includeDeclarations(name, ctx.includes);
  const aggregates = aggregateDeclarations(name, ctx.aggregates);

  return [
    `export type ${name}SelectField = ${union(selects)};`,
    filterDeclaration(`${name}Filter`, filterableFields(ctx)),
    ...includes.declarations,
    ...aggregates.declarations,
    `export interface ${name}SearchOptions<K extends ${name}SelectField = ${name}SelectField> {
  filters?: ${name}Filter[];
  sorts?: Array<${sortEntryType(ctx.sorts)}>;
  selects?: Array<{ field: K }>;
  includes?: Array<${includes.names.join(' | ') || 'never'}>;
  aggregates?: Array<${aggregates.names.join(' | ') || 'never'}>;
  search?: { q?: string; engine?: string${ctx.vector ? "; mode?: 'text' | 'similar'; metric?: 'cosine' | 'l2'" : ''} };
${paginationMembers(ctx.pagination)}
${trashMembers(ctx)}
  capabilities?: string[];
}`,
    `export type ${name}Hit<K extends ${name}SelectField = ${name}SelectField> = Pick<${name}, K> & {
  capabilities?: Record<string, unknown>;
  [alias: string]: unknown;
};`,
    ctx.pagination
      ? `export type ${name}Meta = PagedMeta;`
      : `export type ${name}Meta = UnpagedMeta;`,
  ].join('\n\n');
}

function mutationDeclarations(ctx: ResourceContext): string {
  const name = typeNameOf(ctx);
  const createFields = ctx.fields.map(
    (field) =>
      `  ${field.name}${field.optional ? '?' : ''}: ${inputType(field)};`,
  );
  const patchFields = ctx.fields.map(
    (field) => `  ${field.name}?: ${inputType(field)};`,
  );
  const relationNames = ctx.relations.map((relation) => relation.relation);
  const relations =
    relationNames.length > 0
      ? `\n  relations?: { ${relationNames.map((relation) => `${relation}?: RelationMutation`).join('; ')} };`
      : '';
  const updateData =
    relationNames.length > 0
      ? `${name} & { ${relationNames.map((relation) => `${relation}?: string[]`).join('; ')} }`
      : name;

  return [
    `export interface ${name}CreateItem {\n${createFields.join('\n')}\n}`,
    `export interface ${name}Patch {\n${patchFields.join('\n')}\n}`,
    `export interface ${name}UpdateItem extends ${name}Patch {\n  id: string;${ctx.versioned ? '\n  version: number;' : ''}${relations}\n}`,
    `export type ${name}UpdateData = ${updateData};`,
  ].join('\n\n');
}

function describeDeclaration(ctx: ResourceContext): string {
  const name = typeNameOf(ctx);
  const pagination = ctx.pagination
    ? `  limits: number[];\n  defaultLimit: number;\n  paginated: true;`
    : '  paginated: false;';
  const versioned = ctx.versioned
    ? `\n  versioned: { field: 'version'; header: 'If-Match' };`
    : '';

  return `export interface ${name}Describe {
  version: ${ctx.version};
  fields: Array<{ name: string; type: 'string' | 'int' | 'boolean' | 'datetime' | 'file'; optional: boolean }>;
  sorts: string[];
  filters: string[];
  selects: string[];
  includes: Record<string, DescribedRelation>;
  aggregates: Record<string, DescribedRelation>;
${ctx.vector ? '  similar: true;\n' : ''}${pagination}${versioned}
  rules: { create: Record<string, unknown>; update: Record<string, unknown> };
}`;
}

function childDeclarations(
  ctx: ResourceContext,
  include: ResolvedInclude,
): string {
  const name = `${typeNameOf(ctx)}${pascalOf(include.relation)}`;
  const nested = includeDeclarations(`${name}Rows`, nestedIncludesOf(include));
  const meta = include.pagination ? 'PagedMeta' : 'UnpagedMeta';

  return [
    `export type ${name}RowField = ${union(include.selects)};`,
    filterDeclaration(`${name}RowsFilter`, ['id', ...include.filters]),
    ...nested.declarations,
    `export interface ${name}SearchOptions {
  filters?: ${name}RowsFilter[];
  sorts?: Array<${sortEntryType(include.sorts)}>;
  selects?: Array<${selectEntryType(include.selects)}>;
  includes?: Array<${nested.names.join(' | ') || 'never'}>;
  search?: { q?: string; engine?: string };
${paginationMembers(include.pagination)}
  withTrashed?: never;
  onlyTrashed?: never;
  capabilities?: string[];
}`,
    `export type ${name}Row = { [K in ${name}RowField]?: unknown } & { [key: string]: unknown };`,
    `export type ${name}Meta = ${meta};`,
  ].join('\n\n');
}

function clientFunction(ctx: ResourceContext): string {
  const name = typeNameOf(ctx);
  const route = `/${ctx.routePath}`;
  const mode = ctx.softDeletes
    ? ", options: BatchOptions & { mode?: 'soft' | 'hard' } = {}"
    : ', options: BatchOptions = {}';
  const removeData = ctx.softDeletes ? `${name} | null` : 'null';

  const members = [
    `    search: <K extends ${name}SelectField = ${name}SelectField>(options: ${name}SearchOptions<K> = {}) =>
      request<Envelope<Array<${name}Hit<K>>, ${name}Meta & ResourceMeta>>('POST', '${route}/search', options),`,
    `    create: (data: ${name}CreateItem[], options: BatchOptions = {}) =>
      request<Envelope<Array<Outcome<${name}>>, BatchMeta>>('POST', '${route}/create', { data, ...options }),`,
    `    update: (data: ${name}UpdateItem[], options: BatchOptions = {}) =>
      request<Envelope<Array<IdentifiedOutcome<${name}UpdateData>>, BatchMeta>>('POST', '${route}/update', { data, ...options }),`,
    `    remove: (ids: string[]${mode}) =>
      request<Envelope<Array<IdentifiedOutcome<${removeData}>>, BatchMeta>>('POST', '${route}/delete', { ids, ...options }),`,
  ];

  if (ctx.softDeletes) {
    members.push(`    restore: (ids: string[], patch?: ${name}Patch, options: BatchOptions = {}) =>
      request<Envelope<Array<IdentifiedOutcome<${name}>>, BatchMeta>>('POST', '${route}/restore', { ids, patch, ...options }),`);
  }

  for (const include of ownRouteIncludes(ctx)) {
    const child = `${name}${pascalOf(include.relation)}`;
    members.push(`    search${pascalOf(include.relation)}: (id: string, options: ${child}SearchOptions = {}) =>
      request<Envelope<${child}Row[], ${child}Meta>>('POST', \`${route}/\${encodeURIComponent(id)}/${include.relation}/search\`, options),`);
  }

  members.push(
    `    describe: () => request<Envelope<${name}Describe>>('GET', '${route}/describe'),`,
  );

  return `export function ${operationPrefixOf(ctx)}Client(request: HeryRequest) {
  return {
${members.join('\n')}
  };
}`;
}

function clientKey(ctx: ResourceContext): string {
  return ctx.version === 1
    ? ctx.pluralCamelName
    : `${ctx.pluralCamelName}V${ctx.version}`;
}

const PRELUDE = `export type HeryRequest = <T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<T>;

export type FilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'not like' | 'in' | 'not in';
export type FilterValue = string | number | boolean | Array<string | number>;
export type SortDirection = 'asc' | 'desc';

export interface HeryError {
  status: number;
  key: string;
  message: string;
  details?: unknown;
}

export type Envelope<T, M = undefined> = { data: T; messages: string[] } & ([M] extends [undefined]
  ? unknown
  : { meta: M });

export interface BatchMeta {
  total: number;
  succeeded: number;
  failed: number;
}

export interface BatchOptions {
  atomic?: boolean;
}

export type Outcome<T> =
  | { index: number; status: 'ok'; data: T }
  | { index: number; status: 'error'; error: HeryError };

export type IdentifiedOutcome<T> =
  | { index: number; id: string; status: 'ok'; data: T }
  | { index: number; id: string; status: 'error'; error: HeryError };

export type RelationMutation =
  | { attach?: string[]; detach?: string[]; sync?: never }
  | { sync: string[]; attach?: never; detach?: never };

export interface PagedMeta {
  page: number;
  limit: number;
  last_page: number;
  total: number;
}

export interface UnpagedMeta {
  paginated: false;
  total: number;
}

export interface ResourceMeta {
  channels: string[];
  search?: { matchLimit: number; truncated: boolean; mode?: 'text' | 'similar'; metric?: 'cosine' | 'l2' };
  capabilities?: Record<string, unknown>;
}

export interface DescribedRelation {
  type: 'hasMany' | 'morphMany';
  foreignKey: string;
  discriminator?: string;
  discriminatorValue?: string;
  childDelegate: string;
  filters: string[];
  sorts?: string[];
  selects?: string[];
  fields?: string[];
  includes?: Record<string, DescribedRelation>;
}`;

export function openApiClientFile(contexts: ResourceContext[]): string {
  const sections = contexts.map((ctx) =>
    [
      recordInterface(ctx),
      queryDeclarations(ctx),
      mutationDeclarations(ctx),
      ...ownRouteIncludes(ctx).map((include) =>
        childDeclarations(ctx, include),
      ),
      describeDeclaration(ctx),
      clientFunction(ctx),
    ].join('\n\n'),
  );
  const aggregate = `export function createHeryClient(request: HeryRequest) {
  return {
${contexts.map((ctx) => `    ${clientKey(ctx)}: ${operationPrefixOf(ctx)}Client(request),`).join('\n')}
  };
}`;
  const header = [
    'Generated by `hery openapi:client` from blueprint data. Regenerate it rather than editing it.',
    '',
    'Absent on purpose, because /describe does not publish it:',
    ...OPENAPI_ABSENCES.map((absence) => `- ${absence}`),
  ]
    .map((line) => (line === '' ? '//' : `// ${line}`))
    .join('\n');

  return `${header}\n\n${PRELUDE}\n\n${sections.join('\n\n')}\n\n${aggregate}\n`;
}
