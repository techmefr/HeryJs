import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { ANNOTATION_PREFIX } from '#technical/prisma/model-annotations';

/**
 * Before annotations, each registry was a kernel `Set` of Prisma model names
 * the generator rewrote by pattern. `hery kernel:migrate` still reads them in a
 * project that has not moved yet, so the shape is kept here, and only here.
 */
export function modelSetMarker(setName: string): string {
  return `const ${setName} = new Set<string>([`;
}

export function modelSetPattern(setName: string): RegExp {
  return new RegExp(`const ${setName} = new Set<string>\\(\\[([^\\]]*)\\]\\)`);
}

type Target = 'model' | 'field';

/**
 * Every registry the kernel used to keep, and the annotation that replaces it.
 * A reason is required where the annotation is an opt-out of the tenant
 * boundary: the comment above the entry carries it over.
 */
export const LEGACY_REGISTRIES = [
  {
    file: 'src/technical/prisma/prisma.client.ts',
    set: 'TENANT_SCOPED_MODELS',
    annotation: 'tenantScoped',
    target: 'model',
    reason: false,
  },
  {
    file: 'src/technical/prisma/prisma.client.ts',
    set: 'TENANT_FREE_MODELS',
    annotation: 'tenantFree',
    target: 'model',
    reason: true,
  },
  {
    file: 'src/technical/prisma/prisma.client.ts',
    set: 'APP_ENFORCED_TENANT_MODELS',
    annotation: 'appEnforcedTenant',
    target: 'model',
    reason: true,
  },
  {
    file: 'src/technical/audit/audit-log.ts',
    set: 'AUDITED_MODELS',
    annotation: 'audited',
    target: 'model',
    reason: false,
  },
  {
    file: 'src/technical/history/history-columns.ts',
    set: 'HISTORY_COLUMNS',
    annotation: 'history',
    target: 'field',
    reason: false,
  },
  {
    file: 'src/technical/secrets/encrypted-columns.ts',
    set: 'ENCRYPTED_COLUMNS',
    annotation: 'encrypted',
    target: 'field',
    reason: false,
  },
] as const satisfies readonly {
  file: string;
  set: string;
  annotation: string;
  target: Target;
  reason: boolean;
}[];

export interface LegacyEntry {
  name: string;
  reason: string;
}

/**
 * The entries of one registry, each with the comment written above it. A
 * comment covers every entry that follows it until the next one starts.
 */
export function legacyEntriesIn(
  source: string,
  setName: string,
): LegacyEntry[] {
  const match = modelSetPattern(setName).exec(source);

  if (!match) {
    return [];
  }

  const entries: LegacyEntry[] = [];
  let comment: string[] = [];
  let lastWasEntry = false;

  for (const line of (match[1] ?? '').split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('//')) {
      if (lastWasEntry) {
        comment = [];
      }

      comment.push(trimmed.replace(/^\/\/\s?/, ''));
      lastWasEntry = false;
      continue;
    }

    for (const entry of trimmed.matchAll(/'([^']+)'/g)) {
      entries.push({ name: entry[1]!, reason: comment.join(' ').trim() });
      lastWasEntry = true;
    }
  }

  return entries;
}

function annotationLine(annotation: string, reason: string): string {
  return `/// ${ANNOTATION_PREFIX}${annotation}${reason === '' ? '' : ` ${reason}`}`;
}

function hasAnnotation(docLines: string[], annotation: string): boolean {
  return docLines.some((line) =>
    new RegExp(
      `^\\s*///\\s*${ANNOTATION_PREFIX.replace('.', '\\.')}${annotation}(\\s|$)`,
    ).test(line),
  );
}

function docLinesAbove(lines: string[], index: number): string[] {
  const docs: string[] = [];

  for (
    let at = index - 1;
    at >= 0 && lines[at]!.trim().startsWith('///');
    at--
  ) {
    docs.unshift(lines[at]!);
  }

  return docs;
}

/** Adds `/// @hery.<annotation>` above a model; a no-op once it is there. */
export function annotateModel(
  schemaSource: string,
  model: string,
  annotation: string,
  reason = '',
): string {
  const lines = schemaSource.split('\n');
  const index = lines.findIndex((line) =>
    new RegExp(`^model\\s+${model}\\s*\\{`).test(line),
  );

  if (index === -1) {
    throw new Error(`Could not find "model ${model}" in the schema`);
  }

  if (hasAnnotation(docLinesAbove(lines, index), annotation)) {
    return schemaSource;
  }

  lines.splice(index, 0, annotationLine(annotation, reason));
  return lines.join('\n');
}

/** Adds `/// @hery.<annotation>` above a field of a model; idempotent. */
export function annotateField(
  schemaSource: string,
  model: string,
  field: string,
  annotation: string,
): string {
  const lines = schemaSource.split('\n');
  const start = lines.findIndex((line) =>
    new RegExp(`^model\\s+${model}\\s*\\{`).test(line),
  );

  if (start === -1) {
    throw new Error(`Could not find "model ${model}" in the schema`);
  }

  let index = -1;

  for (let at = start + 1; at < lines.length && lines[at] !== '}'; at++) {
    if (new RegExp(`^\\s+${field}\\s+\\S`).test(lines[at]!)) {
      index = at;
      break;
    }
  }

  if (index === -1) {
    throw new Error(`Could not find field ${model}.${field} in the schema`);
  }

  if (hasAnnotation(docLinesAbove(lines, index), annotation)) {
    return schemaSource;
  }

  const indent = /^\s*/.exec(lines[index]!)?.[0] ?? '  ';
  lines.splice(index, 0, `${indent}${annotationLine(annotation, '')}`);
  return lines.join('\n');
}

const FALLBACK_REASON = (set: string) =>
  `listed in ${set} before the registries became annotations`;

/**
 * Converts the registries of a project still on the kernel lists into
 * annotations of its schema. Returns the annotations it wrote, as
 * `Model @hery.x` or `Model.field @hery.x`; writes nothing when `write` is off.
 */
export function migrateLegacyRegistries(
  root: string,
  { write }: { write: boolean },
): string[] {
  const schemaFile = path.join(root, 'prisma', 'schema.prisma');

  if (!existsSync(schemaFile)) {
    return [];
  }

  const original = readFileSync(schemaFile, 'utf8');
  let schema = original;
  const written: string[] = [];

  for (const registry of LEGACY_REGISTRIES) {
    const file = path.join(root, registry.file);

    if (!existsSync(file)) {
      continue;
    }

    for (const entry of legacyEntriesIn(
      readFileSync(file, 'utf8'),
      registry.set,
    )) {
      const before = schema;

      if (registry.target === 'model') {
        schema = annotateModel(
          schema,
          entry.name,
          registry.annotation,
          registry.reason ? entry.reason || FALLBACK_REASON(registry.set) : '',
        );
      } else {
        const [model, field] = entry.name.split('.');
        schema = annotateField(schema, model!, field!, registry.annotation);
      }

      if (schema !== before) {
        written.push(
          `${entry.name} ${ANNOTATION_PREFIX}${registry.annotation}`,
        );
      }
    }
  }

  if (write && schema !== original) {
    writeFileSync(schemaFile, schema);
  }

  return written;
}
