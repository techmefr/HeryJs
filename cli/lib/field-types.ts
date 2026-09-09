import type { BlueprintField } from './blueprint';

// A `file` field never carries the bytes themselves -- it stores the key an
// upload to POST /storage/upload already returned, the same way every other
// scalar field stores a value the caller already has in hand.
const ZOD_TYPES: Record<BlueprintField['type'], string> = {
  string: 'z.string().min(1).max(255)',
  int: 'z.number().int()',
  boolean: 'z.boolean()',
  datetime: 'z.coerce.date()',
  file: 'z.string().min(1).max(255)',
};

const PRISMA_TYPES: Record<BlueprintField['type'], string> = {
  string: 'String',
  int: 'Int',
  boolean: 'Boolean',
  datetime: 'DateTime',
  file: 'String',
};

export function zodTypeFor(field: BlueprintField): string {
  const base = ZOD_TYPES[field.type];
  return field.optional ? `${base}.optional()` : base;
}

export function zodOutputTypeFor(field: BlueprintField): string {
  const base = ZOD_TYPES[field.type];
  return field.optional ? `${base}.nullable()` : base;
}

export function prismaTypeFor(field: BlueprintField): string {
  const base = PRISMA_TYPES[field.type];
  return field.optional ? `${base}?` : base;
}

export function sampleValueFor(field: BlueprintField): string {
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
  }
}

const GRAPHQL_TYPES: Record<BlueprintField['type'], string> = {
  string: 'String',
  int: 'Int',
  boolean: 'Boolean',
  datetime: 'GraphQLISODateTime',
  file: 'String',
};

export function graphqlTypeFor(field: BlueprintField): string {
  return GRAPHQL_TYPES[field.type];
}

const TS_TYPES: Record<BlueprintField['type'], string> = {
  string: 'string',
  int: 'number',
  boolean: 'boolean',
  datetime: 'Date',
  file: 'string',
};

export function tsTypeFor(field: BlueprintField): string {
  return TS_TYPES[field.type];
}

const FAKER_VALUES: Record<BlueprintField['type'], string> = {
  string: 'faker.lorem.words(3)',
  int: 'faker.number.int({ min: 1, max: 1000 })',
  boolean: 'faker.datatype.boolean()',
  datetime: 'faker.date.recent()',
  file: '`${faker.string.uuid()}.png`',
};

export function fakerValueFor(field: BlueprintField): string {
  return FAKER_VALUES[field.type];
}
