import type { ScalarBlueprintField, ScalarFieldType } from './blueprint';

// A `file` field never carries the bytes themselves -- it stores the key an
// upload to POST /storage/upload already returned, the same way every other
// scalar field stores a value the caller already has in hand.
//
// A `slug` is the same pattern and length as SLUG_PATTERN and SLUG_MAX_LENGTH
// in src/technical/slug/slug.ts, written out because generated code carries no
// import for a constant.
const ZOD_TYPES: Record<ScalarFieldType, string> = {
  string: 'z.string().min(1).max(255)',
  int: 'z.number().int()',
  boolean: 'z.boolean()',
  datetime: 'z.coerce.date()',
  file: 'z.string().min(1).max(255)',
  encrypted: 'z.string().min(1).max(4096)',
  slug: 'z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)',
  // The view's rule: sanitising can leave nothing of what was sent.
  richtext: 'z.string()',
};

const PRISMA_TYPES: Record<ScalarFieldType, string> = {
  string: 'String',
  int: 'Int',
  boolean: 'Boolean',
  datetime: 'DateTime',
  file: 'String',
  encrypted: 'String',
  slug: 'String',
  richtext: 'String',
};

export const RICHTEXT_DEFAULT_MAX_LENGTH = 20000;

export function richtextMaxLength(field: ScalarBlueprintField): number {
  return field.maxLength ?? RICHTEXT_DEFAULT_MAX_LENGTH;
}

// The size limit is on what the client sends, before the sanitiser shrinks it.
function inputRuleFor(field: ScalarBlueprintField): string {
  return field.type === 'richtext'
    ? `z.string().min(1).max(${richtextMaxLength(field)})`
    : ZOD_TYPES[field.type];
}

// A slug is filled in by the service when the client sends none, so it is
// never required on the way in, however the blueprint spells optional.
export function isOptionalOnInput(field: ScalarBlueprintField): boolean {
  return field.optional || field.type === 'slug';
}

export function zodTypeFor(field: ScalarBlueprintField): string {
  const rule = inputRuleFor(field);
  const base = field.translatable ? `translatableInputSchema(${rule})` : rule;
  return isOptionalOnInput(field) ? `${base}.optional()` : base;
}

export function zodOutputTypeFor(field: ScalarBlueprintField): string {
  const base = ZOD_TYPES[field.type];
  return field.optional ? `${base}.nullable()` : base;
}

export function prismaTypeFor(field: ScalarBlueprintField): string {
  const base = field.translatable ? 'Json' : PRISMA_TYPES[field.type];
  return field.optional ? `${base}?` : base;
}

export function sampleValueFor(field: ScalarBlueprintField): string {
  switch (field.type) {
    case 'string':
      return `'${field.name}-value'`;
    case 'int':
      return '1';
    case 'boolean':
      return 'true';
    case 'datetime':
      return 'new Date().toISOString()';
    case 'file':
      return `'${field.name}-key.png'`;
    case 'encrypted':
      return `'${field.name}-secret-value'`;
    case 'slug':
      return `'${field.name}-value'`;
    case 'richtext':
      return `'<p>${field.name}-value</p>'`;
  }
}

const GRAPHQL_TYPES: Record<ScalarFieldType, string> = {
  string: 'String',
  int: 'Int',
  boolean: 'Boolean',
  datetime: 'GraphQLISODateTime',
  file: 'String',
  encrypted: 'String',
  slug: 'String',
  richtext: 'String',
};

export function graphqlTypeFor(field: ScalarBlueprintField): string {
  return GRAPHQL_TYPES[field.type];
}

const TS_TYPES: Record<ScalarFieldType, string> = {
  string: 'string',
  int: 'number',
  boolean: 'boolean',
  datetime: 'Date',
  file: 'string',
  encrypted: 'string',
  slug: 'string',
  richtext: 'string',
};

export function tsTypeFor(field: ScalarBlueprintField): string {
  return TS_TYPES[field.type];
}

export function storedTsTypeFor(field: ScalarBlueprintField): string {
  return field.translatable ? 'Record<string, string>' : TS_TYPES[field.type];
}

const FAKER_VALUES: Record<ScalarFieldType, string> = {
  string: 'faker.lorem.words(3)',
  int: 'faker.number.int({ min: 1, max: 1000 })',
  boolean: 'faker.datatype.boolean()',
  datetime: 'faker.date.recent()',
  file: '`${faker.string.uuid()}.png`',
  encrypted: 'faker.string.alphanumeric(24)',
  slug: "`${faker.lorem.slug(3)}-${faker.string.alphanumeric({ length: 6, casing: 'lower' })}`",
  richtext: '`<p>${faker.lorem.sentence()}</p>`',
};

export function fakerValueFor(field: ScalarBlueprintField): string {
  const value = FAKER_VALUES[field.type];
  return field.translatable ? `{ [resolveDefaultLocale()]: ${value} }` : value;
}
