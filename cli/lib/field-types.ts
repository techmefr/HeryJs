import type { BlueprintField } from './blueprint';

const ZOD_TYPES: Record<BlueprintField['type'], string> = {
  string: 'z.string()',
  int: 'z.number().int()',
  boolean: 'z.boolean()',
  datetime: 'z.coerce.date()',
};

const PRISMA_TYPES: Record<BlueprintField['type'], string> = {
  string: 'String',
  int: 'Int',
  boolean: 'Boolean',
  datetime: 'DateTime',
};

export function zodTypeFor(field: BlueprintField): string {
  const base = ZOD_TYPES[field.type];
  return field.optional ? `${base}.optional()` : base;
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
  }
}

const TS_TYPES: Record<BlueprintField['type'], string> = {
  string: 'string',
  int: 'number',
  boolean: 'boolean',
  datetime: 'Date',
};

export function tsTypeFor(field: BlueprintField): string {
  return TS_TYPES[field.type];
}

const FAKER_VALUES: Record<BlueprintField['type'], string> = {
  string: 'faker.lorem.words(3)',
  int: 'faker.number.int({ min: 1, max: 1000 })',
  boolean: 'faker.datatype.boolean()',
  datetime: 'faker.date.recent()',
};

export function fakerValueFor(field: BlueprintField): string {
  return FAKER_VALUES[field.type];
}
