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
