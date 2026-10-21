import type {
  ResolvedInclude,
  ScalarBlueprintField,
  ScalarFieldType,
} from './blueprint';
import type { ResourceContext } from './resource-context';

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

export const AGGREGATE_TYPES = [
  'count',
  'exists',
  'avg',
  'sum',
  'min',
  'max',
] as const;
export const AGGREGATE_TYPES_NEEDING_FIELD = [
  'avg',
  'sum',
  'min',
  'max',
] as const;
export const AGGREGATE_TYPES_WITHOUT_FIELD = ['count', 'exists'] as const;

export const MAX_BATCH_ENTRIES = 100;
export const MAX_FILTERS = 50;
export const MAX_SORTS = 10;
export const MAX_SELECTS = 100;
export const MAX_RELATIONS = 20;
export const MAX_IN_VALUES = 500;
export const MAX_CAPABILITIES = 50;
export const MAX_INCLUDE_LIMIT = 1000;
export const MAX_PAGE = 100_000;
export const MAX_STRING_LENGTH = 255;
export const ALIAS_PATTERN = '^[A-Za-z_][A-Za-z0-9_]*$';

export interface RecordProperty {
  name: string;
  type: ScalarFieldType | 'id' | 'timestamp' | 'translations';
  optional: boolean;
}

export function isOwnedByTeam(ctx: ResourceContext): boolean {
  return Object.values(ctx.permissions).includes('team');
}

export function typeNameOf(ctx: ResourceContext): string {
  return ctx.version === 1
    ? ctx.pascalName
    : `${ctx.pascalName}V${ctx.version}`;
}

export function operationPrefixOf(ctx: ResourceContext): string {
  return ctx.version === 1 ? ctx.camelName : `${ctx.camelName}V${ctx.version}`;
}

export function visibleFields(ctx: ResourceContext): ScalarBlueprintField[] {
  return ctx.fields.filter((field) => !field.hidden);
}

export function selectableFields(ctx: ResourceContext): string[] {
  return [
    'id',
    'ownerId',
    ...(isOwnedByTeam(ctx) ? ['teamId'] : []),
    ...visibleFields(ctx).flatMap((field) =>
      field.translatable
        ? [field.name, `${field.name}Translations`]
        : [field.name],
    ),
    'createdAt',
    'updatedAt',
    ...(ctx.softDeletes ? ['deletedAt'] : []),
    ...(ctx.versioned ? ['version'] : []),
    ...(ctx.workflow ? [ctx.workflow.field] : []),
  ];
}

export function filterableFields(ctx: ResourceContext): string[] {
  return ['id', ...ctx.filters];
}

export function recordProperties(ctx: ResourceContext): RecordProperty[] {
  return [
    { name: 'id', type: 'id', optional: false },
    { name: 'tenantId', type: 'id', optional: false },
    { name: 'ownerId', type: 'id', optional: false },
    ...(isOwnedByTeam(ctx)
      ? [{ name: 'teamId', type: 'id' as const, optional: false }]
      : []),
    ...visibleFields(ctx).flatMap((field): RecordProperty[] =>
      field.translatable
        ? [
            { name: field.name, type: field.type, optional: true },
            {
              name: `${field.name}Translations`,
              type: 'translations',
              optional: false,
            },
          ]
        : [{ name: field.name, type: field.type, optional: field.optional }],
    ),
    { name: 'createdAt', type: 'timestamp', optional: false },
    { name: 'updatedAt', type: 'timestamp', optional: false },
    ...(ctx.softDeletes
      ? [{ name: 'deletedAt', type: 'timestamp' as const, optional: true }]
      : []),
    ...(ctx.versioned
      ? [{ name: 'version', type: 'int' as const, optional: false }]
      : []),
    ...(ctx.workflow
      ? [
          {
            name: ctx.workflow.field,
            type: 'string' as const,
            optional: false,
          },
        ]
      : []),
  ];
}

export function ownRouteIncludes(ctx: ResourceContext): ResolvedInclude[] {
  return ctx.includes.filter((include) => include.ownRoute);
}

export function pascalOf(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function nestedIncludesOf(
  include: ResolvedInclude,
): readonly ResolvedInclude[] {
  return include.type === 'hasMany' ? (include.includes ?? []) : [];
}

export const OPENAPI_ABSENCES = [
  'The resolved-capability block (`capabilities` on a record, and on `meta`): /describe publishes neither its keys nor its values, so it is an open object.',
  'Capability-dependent shapes: nothing in /describe says a field or route varies with the caller, so none is modelled. A route the caller lacks the capability for answers 403.',
  'Morph targets: /describe names a morphMany relation, its discriminator and its discriminator value, but not which resource the rows belong to or the types of their fields.',
  'The types of included rows and of aggregate values under an alias: /describe lists the selectable names of a relation, not their types.',
  'The content of `messages`, `meta.channels`, error `details`, and the JSON Schema under `rules` beyond being an object.',
] as const;
