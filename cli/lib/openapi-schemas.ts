import type {
  ScalarBlueprintField,
  ResolvedAggregate,
  ResolvedInclude,
} from './blueprint';
import type { ResourceContext } from './resource-context';
import { richtextMaxLength } from './field-types';
import {
  AGGREGATE_TYPES_NEEDING_FIELD,
  AGGREGATE_TYPES_WITHOUT_FIELD,
  ALIAS_PATTERN,
  MAX_BATCH_ENTRIES,
  MAX_CAPABILITIES,
  MAX_FILTERS,
  MAX_INCLUDE_LIMIT,
  MAX_PAGE,
  MAX_RELATIONS,
  MAX_SELECTS,
  MAX_SORTS,
  MAX_STRING_LENGTH,
  filterableFields,
  nestedIncludesOf,
  pascalOf,
  recordProperties,
  selectableFields,
  typeNameOf,
} from './openapi-contract';
import type { RecordProperty } from './openapi-contract';

export type JsonSchema = Record<string, unknown>;
export type SchemaRegistry = Record<string, JsonSchema>;

export interface QueryContract {
  name: string;
  filters: readonly string[];
  sorts: readonly string[];
  selects: readonly string[];
  includes: readonly ResolvedInclude[];
  aggregates: readonly ResolvedAggregate[];
  pagination: ResourceContext['pagination'];
  trash: boolean;
  similar: boolean;
}

const REJECTED: JsonSchema = { not: {} };
const DATE_TIME: JsonSchema = { type: 'string', format: 'date-time' };

export function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

export function namesOf(names: readonly string[]): JsonSchema {
  return names.length === 0 ? REJECTED : { type: 'string', enum: [...names] };
}

function fieldBaseSchema(type: RecordProperty['type']): JsonSchema {
  switch (type) {
    case 'int':
      return { type: 'integer' };
    case 'boolean':
      return { type: 'boolean' };
    case 'datetime':
    case 'timestamp':
      return DATE_TIME;
    case 'translations':
      return { type: 'object', additionalProperties: { type: 'string' } };
    case 'richtext':
      return { type: 'string', format: 'html', description: RICHTEXT_NOTE };
    default:
      return { type: 'string' };
  }
}

const RICHTEXT_NOTE =
  'Sanitised HTML: tags and attributes outside the field allow-list (published by GET /describe) are stripped on write, and again on read. Never trust it without escaping on a surface the allow-list does not cover.';

function inputFieldSchema(field: ScalarBlueprintField): JsonSchema {
  if (field.translatable) {
    const text: JsonSchema = {
      type: 'string',
      minLength: 1,
      maxLength: MAX_STRING_LENGTH,
    };

    return {
      oneOf: [
        text,
        {
          type: 'object',
          minProperties: 1,
          additionalProperties: { anyOf: [text, { type: 'null' }] },
        },
      ],
    };
  }

  if (field.type === 'richtext') {
    return {
      type: 'string',
      format: 'html',
      minLength: 1,
      maxLength: richtextMaxLength(field),
      description: RICHTEXT_NOTE,
    };
  }

  if (field.type === 'string' || field.type === 'file') {
    return { type: 'string', minLength: 1, maxLength: MAX_STRING_LENGTH };
  }
  return fieldBaseSchema(field.type);
}

function recordPropertySchema(property: RecordProperty): JsonSchema {
  const base = fieldBaseSchema(property.type);
  return property.optional ? { anyOf: [base, { type: 'null' }] } : base;
}

export function recordSchema(ctx: ResourceContext): JsonSchema {
  const properties = Object.fromEntries(
    recordProperties(ctx).map((property) => [
      property.name,
      recordPropertySchema(property),
    ]),
  );

  return { type: 'object', properties, required: Object.keys(properties) };
}

export function searchHitSchema(ctx: ResourceContext): JsonSchema {
  const record = recordSchema(ctx) as {
    properties: Record<string, JsonSchema>;
  };

  return {
    type: 'object',
    description:
      'Only the keys named in `selects` are present when `selects` is given. Includes and aggregates are merged on under their alias (or relation name, or `<relation>_<type>`), and `capabilities` is added when the request names any; none of those shapes are in /describe.',
    properties: { ...record.properties, capabilities: ref('Capabilities') },
    additionalProperties: true,
  };
}

function filterSchema(name: string, fields: readonly string[]): JsonSchema {
  return {
    type: 'object',
    properties: {
      field: namesOf(fields),
      operator: ref('FilterOperator'),
      value: ref('FilterValue'),
      type: { type: 'string', enum: ['and', 'or'] },
      nested: { type: 'array', maxItems: MAX_FILTERS, items: ref(name) },
    },
  };
}

function filtersProperty(name: string): JsonSchema {
  return { type: 'array', maxItems: MAX_FILTERS, items: ref(name) };
}

function sortEntrySchema(fields: readonly string[]): JsonSchema {
  return {
    type: 'object',
    properties: {
      field: namesOf(fields),
      direction: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
    },
    required: ['field'],
  };
}

function selectEntrySchema(fields: readonly string[]): JsonSchema {
  return {
    type: 'object',
    properties: { field: namesOf(fields) },
    required: ['field'],
  };
}

function listOf(items: JsonSchema, maxItems: number): JsonSchema {
  return { type: 'array', maxItems, items };
}

function includeEntrySchema(
  prefix: string,
  include: ResolvedInclude,
  registry: SchemaRegistry,
): JsonSchema {
  const name = `${prefix}${pascalOf(include.relation)}`;
  const nested = nestedIncludesOf(include);
  registry[`${name}Filter`] = filterSchema(`${name}Filter`, [
    'id',
    ...include.filters,
  ]);

  return {
    type: 'object',
    properties: {
      relation: { const: include.relation },
      alias: {
        type: 'string',
        maxLength: MAX_STRING_LENGTH,
        pattern: ALIAS_PATTERN,
      },
      filters: filtersProperty(`${name}Filter`),
      sorts: listOf(sortEntrySchema(include.sorts), MAX_SORTS),
      selects: listOf(selectEntrySchema(include.selects), MAX_SELECTS),
      ...(include.type === 'hasMany'
        ? { limit: { type: 'integer', minimum: 1, maximum: MAX_INCLUDE_LIMIT } }
        : {}),
      ...(nested.length > 0
        ? {
            includes: listOf(
              {
                oneOf: nested.map((entry) =>
                  includeEntrySchema(name, entry, registry),
                ),
              },
              MAX_RELATIONS,
            ),
          }
        : {}),
    },
    required: ['relation'],
  };
}

function aggregateEntrySchemas(
  prefix: string,
  aggregate: ResolvedAggregate,
  registry: SchemaRegistry,
): JsonSchema[] {
  const name = `${prefix}Aggregate${pascalOf(aggregate.relation)}`;
  registry[`${name}Filter`] = filterSchema(`${name}Filter`, [
    'id',
    ...aggregate.filters,
  ]);
  const shared = {
    relation: { const: aggregate.relation },
    alias: {
      type: 'string',
      maxLength: MAX_STRING_LENGTH,
      pattern: ALIAS_PATTERN,
    },
    filters: filtersProperty(`${name}Filter`),
  };

  const schemas: JsonSchema[] = [
    {
      type: 'object',
      properties: {
        ...shared,
        type: { type: 'string', enum: [...AGGREGATE_TYPES_WITHOUT_FIELD] },
      },
      required: ['relation', 'type'],
    },
  ];

  if (aggregate.fields.length > 0) {
    schemas.push({
      type: 'object',
      properties: {
        ...shared,
        type: { type: 'string', enum: [...AGGREGATE_TYPES_NEEDING_FIELD] },
        field: namesOf(aggregate.fields),
      },
      required: ['relation', 'type', 'field'],
    });
  }

  return schemas;
}

export function queryRequestSchemas(query: QueryContract): SchemaRegistry {
  const registry: SchemaRegistry = {};
  const filterName = `${query.name}Filter`;
  registry[filterName] = filterSchema(filterName, query.filters);

  const includes =
    query.includes.length === 0
      ? { type: 'array', maxItems: 0 }
      : listOf(
          {
            oneOf: query.includes.map((entry) =>
              includeEntrySchema(query.name, entry, registry),
            ),
          },
          MAX_RELATIONS,
        );
  const aggregateEntries = query.aggregates.flatMap((aggregate) =>
    aggregateEntrySchemas(query.name, aggregate, registry),
  );
  const aggregates =
    aggregateEntries.length === 0
      ? { type: 'array', maxItems: 0 }
      : listOf({ oneOf: aggregateEntries }, MAX_RELATIONS);

  registry[`${query.name}SearchRequest`] = {
    type: 'object',
    properties: {
      filters: filtersProperty(filterName),
      sorts: listOf(sortEntrySchema(query.sorts), MAX_SORTS),
      selects: listOf(selectEntrySchema(query.selects), MAX_SELECTS),
      includes,
      aggregates,
      search: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          engine: { type: 'string' },
          ...(query.similar
            ? {
                mode: { type: 'string', enum: ['text', 'similar'] },
                metric: { type: 'string', enum: ['cosine', 'l2'] },
              }
            : {}),
        },
      },
      page: query.pagination
        ? { type: 'integer', minimum: 1, maximum: MAX_PAGE }
        : {
            ...REJECTED,
            description:
              'This resource does not paginate; naming a page is rejected.',
          },
      limit: query.pagination
        ? {
            type: 'integer',
            enum: [...query.pagination.limits],
            default: query.pagination.default,
          }
        : {
            ...REJECTED,
            description:
              'This resource does not paginate; naming a limit is rejected.',
          },
      withTrashed: query.trash
        ? { type: 'boolean' }
        : {
            ...REJECTED,
            description: 'This resource has no bin; asking for it is rejected.',
          },
      onlyTrashed: query.trash
        ? { type: 'boolean' }
        : {
            ...REJECTED,
            description: 'This resource has no bin; asking for it is rejected.',
          },
      capabilities: {
        type: 'array',
        maxItems: MAX_CAPABILITIES,
        items: { type: 'string' },
      },
    },
  };

  return registry;
}

export function resourceQuery(ctx: ResourceContext): QueryContract {
  return {
    name: typeNameOf(ctx),
    filters: filterableFields(ctx),
    sorts: ctx.sorts,
    selects: selectableFields(ctx),
    includes: ctx.includes,
    aggregates: ctx.aggregates,
    pagination: ctx.pagination,
    trash: ctx.softDeletes,
    similar: ctx.vector !== null,
  };
}

export function childQuery(
  ctx: ResourceContext,
  include: ResolvedInclude,
): QueryContract {
  return {
    name: `${typeNameOf(ctx)}${pascalOf(include.relation)}Rows`,
    filters: ['id', ...include.filters],
    sorts: include.sorts,
    selects: include.selects,
    includes: nestedIncludesOf(include),
    aggregates: [],
    pagination: include.pagination,
    trash: false,
    similar: false,
  };
}

export function childRowSchema(include: ResolvedInclude): JsonSchema {
  return {
    type: 'object',
    description:
      "Keys are the relation's declared selects. /describe lists their names but not their types, so no value is typed here.",
    properties: Object.fromEntries(include.selects.map((name) => [name, {}])),
    additionalProperties: true,
  };
}

function createItemSchema(ctx: ResourceContext): JsonSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      ctx.fields.map((field) => [field.name, inputFieldSchema(field)]),
    ),
    required: ctx.fields
      .filter((field) => !field.optional)
      .map((field) => field.name),
    additionalProperties: false,
  };
}

function updatePatchSchema(ctx: ResourceContext): JsonSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      ctx.fields.map((field) => [field.name, inputFieldSchema(field)]),
    ),
    additionalProperties: false,
  };
}

function relationMutationSchema(): JsonSchema {
  const ids = {
    type: 'array',
    maxItems: MAX_BATCH_ENTRIES,
    items: { type: 'string' },
  };

  return {
    type: 'object',
    properties: { attach: ids, detach: ids, sync: ids },
    description: 'sync cannot be combined with attach or detach.',
  };
}

function updateItemSchema(ctx: ResourceContext): JsonSchema {
  const patch = updatePatchSchema(ctx) as {
    properties: Record<string, JsonSchema>;
  };
  const relations =
    ctx.relations.length > 0
      ? {
          relations: {
            type: 'object',
            properties: Object.fromEntries(
              ctx.relations.map((relation) => [
                relation.relation,
                ref('RelationMutation'),
              ]),
            ),
            additionalProperties: false,
          },
        }
      : {};

  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
      ...(ctx.versioned
        ? {
            version: {
              type: 'integer',
              minimum: 1,
              description:
                'The version this entry read. Required on a versioned resource; a request carrying a single entry may send it as an If-Match header instead.',
            },
          }
        : {}),
      ...patch.properties,
      ...relations,
    },
    required: ['id'],
    additionalProperties: false,
  };
}

function idsList(): JsonSchema {
  return {
    type: 'array',
    maxItems: MAX_BATCH_ENTRIES,
    items: { type: 'string' },
  };
}

const ATOMIC_PROPERTY: JsonSchema = {
  type: 'boolean',
  default: false,
  description:
    'When true the batch is all or nothing: every entry is authorised first, the writes run in one transaction, and the first failure rolls everything back and answers 422 with a result for every entry.',
};

export function mutationSchemas(ctx: ResourceContext): SchemaRegistry {
  const name = typeNameOf(ctx);
  const registry: SchemaRegistry = {
    [`${name}CreateRequest`]: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          maxItems: MAX_BATCH_ENTRIES,
          items: ref(`${name}CreateItem`),
        },
        atomic: ATOMIC_PROPERTY,
      },
      required: ['data'],
    },
    [`${name}CreateItem`]: createItemSchema(ctx),
    [`${name}UpdateRequest`]: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          maxItems: MAX_BATCH_ENTRIES,
          items: ref(`${name}UpdateItem`),
        },
        atomic: ATOMIC_PROPERTY,
      },
      required: ['data'],
    },
    [`${name}UpdateItem`]: updateItemSchema(ctx),
    [`${name}DeleteRequest`]: {
      type: 'object',
      properties: {
        ids: idsList(),
        ...(ctx.softDeletes
          ? {
              mode: { type: 'string', enum: ['soft', 'hard'], default: 'soft' },
            }
          : {}),
        atomic: ATOMIC_PROPERTY,
      },
      required: ['ids'],
    },
  };

  if (ctx.relations.length > 0) {
    registry.RelationMutation = relationMutationSchema();
  }

  if (ctx.softDeletes) {
    registry[`${name}RestoreRequest`] = {
      type: 'object',
      properties: {
        ids: idsList(),
        patch: ref(`${name}Patch`),
        atomic: ATOMIC_PROPERTY,
      },
      required: ['ids'],
    };
    registry[`${name}Patch`] = updatePatchSchema(ctx);
  }

  return registry;
}

export function sharedSchemas(): SchemaRegistry {
  return {
    FilterOperator: {
      type: 'string',
      enum: [
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
      ],
    },
    FilterValue: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        {
          type: 'array',
          maxItems: 500,
          items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
      ],
    },
    Capabilities: {
      type: 'object',
      description:
        'Resolved capabilities. /describe does not publish their names or their shape, so no key and no value is typed here.',
      additionalProperties: true,
    },
    Messages: { type: 'array', items: { type: 'string' } },
    BatchMeta: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        succeeded: { type: 'integer' },
        failed: { type: 'integer' },
      },
      required: ['total', 'succeeded', 'failed'],
    },
    ResolvedError: {
      type: 'object',
      properties: {
        status: { type: 'integer' },
        key: { type: 'string' },
        message: { type: 'string' },
        details: {},
      },
      required: ['status', 'key', 'message'],
    },
    ErrorResponse: {
      type: 'object',
      properties: { error: ref('ResolvedError') },
      required: ['error'],
    },
  };
}

export function envelope(data: JsonSchema, meta?: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      data,
      ...(meta ? { meta } : {}),
      messages: ref('Messages'),
    },
    required: meta ? ['data', 'meta', 'messages'] : ['data', 'messages'],
  };
}

export function pageMeta(
  pagination: ResourceContext['pagination'],
  resourceLevel: boolean,
): JsonSchema {
  const channels = resourceLevel
    ? { channels: { type: 'array', items: { type: 'string' } } }
    : {};
  const required = resourceLevel ? ['channels', 'total'] : ['total'];
  const paginated: JsonSchema = {
    type: 'object',
    properties: {
      ...channels,
      page: { type: 'integer' },
      limit: { type: 'integer' },
      last_page: { type: 'integer' },
      total: { type: 'integer' },
    },
    required: [...required, 'page', 'limit', 'last_page'],
  };
  const unpaginated: JsonSchema = {
    type: 'object',
    properties: {
      ...channels,
      paginated: { const: false },
      total: { type: 'integer' },
    },
    required: [...required, 'paginated'],
  };
  const extras = resourceLevel
    ? {
        search: {
          type: 'object',
          properties: {
            matchLimit: { type: 'integer' },
            truncated: { type: 'boolean' },
            mode: { type: 'string', enum: ['text', 'similar'] },
            metric: { type: 'string', enum: ['cosine', 'l2'] },
          },
        },
        capabilities: ref('Capabilities'),
      }
    : {};

  const base = pagination ? paginated : unpaginated;
  const withExtras = base as { properties: Record<string, JsonSchema> };

  return { ...base, properties: { ...withExtras.properties, ...extras } };
}

export function batchOutcomeSchema(
  data: JsonSchema,
  withId: boolean,
): JsonSchema {
  const id = withId ? { id: { type: 'string' } } : {};
  const idRequired = withId ? ['id'] : [];

  return {
    type: 'array',
    items: {
      oneOf: [
        {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            ...id,
            status: { const: 'ok' },
            data,
          },
          required: ['index', ...idRequired, 'status', 'data'],
        },
        {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            ...id,
            status: { const: 'error' },
            error: ref('ResolvedError'),
          },
          required: ['index', ...idRequired, 'status', 'error'],
        },
      ],
    },
  };
}

export function describeSchema(ctx: ResourceContext): JsonSchema {
  const relationContract: JsonSchema = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['hasMany', 'morphMany'] },
      foreignKey: { type: 'string' },
      discriminator: { type: 'string' },
      discriminatorValue: { type: 'string' },
      childDelegate: { type: 'string' },
      filters: { type: 'array', items: { type: 'string' } },
      sorts: { type: 'array', items: { type: 'string' } },
      selects: { type: 'array', items: { type: 'string' } },
      fields: { type: 'array', items: { type: 'string' } },
      includes: { type: 'object', additionalProperties: { type: 'object' } },
    },
    required: ['type', 'foreignKey', 'childDelegate', 'filters'],
  };
  const strings: JsonSchema = { type: 'array', items: { type: 'string' } };

  return {
    type: 'object',
    properties: {
      version: { const: ctx.version },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: [
                'string',
                'int',
                'boolean',
                'datetime',
                'file',
                'richtext',
              ],
            },
            optional: { type: 'boolean' },
            translatable: { type: 'boolean' },
            richtext: {
              type: 'object',
              properties: {
                maxLength: { type: 'integer' },
                allow: {
                  type: 'object',
                  properties: {
                    tags: strings,
                    attributes: {
                      type: 'object',
                      additionalProperties: strings,
                    },
                    schemes: strings,
                  },
                  required: ['tags', 'attributes', 'schemes'],
                },
              },
              required: ['maxLength', 'allow'],
            },
          },
          required: ['name', 'type', 'optional'],
        },
      },
      locales: {
        type: 'object',
        properties: {
          supported: strings,
          default: { type: 'string' },
          fallbacks: {
            type: 'object',
            additionalProperties: strings,
          },
        },
        required: ['supported', 'default', 'fallbacks'],
      },
      sorts: strings,
      filters: strings,
      selects: strings,
      includes: { type: 'object', additionalProperties: relationContract },
      aggregates: { type: 'object', additionalProperties: relationContract },
      ...(ctx.pagination
        ? {
            limits: { type: 'array', items: { type: 'integer' } },
            defaultLimit: { type: 'integer' },
          }
        : {}),
      ...(ctx.vector ? { similar: { const: true } } : {}),
      paginated: { const: Boolean(ctx.pagination) },
      ...(ctx.versioned
        ? {
            versioned: {
              type: 'object',
              properties: {
                field: { const: 'version' },
                header: { const: 'If-Match' },
              },
              required: ['field', 'header'],
            },
          }
        : {}),
      rules: {
        type: 'object',
        properties: { create: { type: 'object' }, update: { type: 'object' } },
        required: ['create', 'update'],
      },
    },
    required: [
      'version',
      'fields',
      'sorts',
      'filters',
      'selects',
      'includes',
      'aggregates',
      'paginated',
      'rules',
    ],
  };
}

export function updateOutcomeData(ctx: ResourceContext): JsonSchema {
  const name = typeNameOf(ctx);
  if (ctx.relations.length === 0) {
    return ref(name);
  }

  return {
    allOf: [
      ref(name),
      {
        type: 'object',
        properties: Object.fromEntries(
          ctx.relations.map((relation) => [
            relation.relation,
            { type: 'array', items: { type: 'string' } },
          ]),
        ),
      },
    ],
  };
}
