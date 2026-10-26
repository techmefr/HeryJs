import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import type { LoadedModule } from './module-definition';
import { recordPatches } from './module-patches';
import {
  APP_SCHEMA,
  KERNEL_SCHEMA,
  PRISMA_SCHEMA_FOLDER,
  modelNamesIn,
} from './schema-patch';

export const LEGACY_SCHEMA = 'prisma/schema.prisma';
export const KERNEL_SCHEMA_SOURCE = path.join(
  'packages',
  'core',
  'prisma',
  'core.prisma',
);

const PRISMA_CONFIG = 'prisma.config.ts';
const MIGRATIONS_FOLDER = 'prisma/migrations';
const PACKAGE_MANIFEST = 'package.json';

// Everything since the previous block belongs to the next one: the comments
// and annotations written above a model travel with it.
const BLOCK =
  /[\s\S]*?^(model|enum|type|view|generator|datasource)\s+(\w+)\s*\{[\s\S]*?^\}[^\n]*\n?/gm;

export interface SchemaOwners {
  kernel: Set<string>;
  files: Map<string, string>;
}

function ownerOf(kind: string, name: string, owners: SchemaOwners): string {
  if (
    kind === 'generator' ||
    kind === 'datasource' ||
    owners.kernel.has(name)
  ) {
    return KERNEL_SCHEMA;
  }

  return owners.files.get(name) ?? APP_SCHEMA;
}

/**
 * Cuts a single schema.prisma into the folder layout: the generators, the
 * datasource and the kernel's models under _hery/, each module's models in a
 * file of its own, and everything else in the project's app.prisma.
 */
export function splitSchema(
  source: string,
  owners: SchemaOwners,
): Map<string, string> {
  const files = new Map<string, string[]>();
  let consumed = 0;
  let last = KERNEL_SCHEMA;

  for (const match of source.matchAll(BLOCK)) {
    const file = ownerOf(match[1]!, match[2]!, owners);
    const block = match[0].replace(/^\n+/, '');

    files.set(file, [...(files.get(file) ?? []), block.trimEnd()]);
    consumed = match.index + match[0].length;
    last = file;
  }

  const rest = source.slice(consumed).trim();

  if (rest !== '') {
    files.set(last, [...(files.get(last) ?? []), rest]);
  }

  return new Map(
    [...files].map(([file, blocks]) => [file, `${blocks.join('\n\n')}\n`]),
  );
}

function referencedType(fieldLine: string): string | undefined {
  return fieldLine
    .trim()
    .split(/\s+/)[1]
    ?.replace(/[[\]?]/g, '');
}

/**
 * The kernel's schema as the kernel ships it: the project's _hery/core.prisma
 * without the back-relations its own models and its modules hang on User and
 * Team, and without the fields its modules add there.
 */
export function kernelSchemaOf(
  projectKernelSchema: string,
  addedFieldNames: Set<string>,
): string {
  const kernelTypes = new Set(
    [
      ...projectKernelSchema.matchAll(
        /^(?:model|enum|type|view)\s+(\w+)\s*\{/gm,
      ),
    ].map((match) => match[1]!),
  );
  const scalars = new Set([
    'String',
    'Boolean',
    'Int',
    'BigInt',
    'Float',
    'Decimal',
    'DateTime',
    'Json',
    'Bytes',
    'Unsupported',
  ]);
  let insideModel = false;

  return projectKernelSchema
    .split('\n')
    .filter((line) => {
      if (/^model\s+\w+\s*\{/.test(line)) {
        insideModel = true;
        return true;
      }

      if (line.startsWith('}')) {
        insideModel = false;
        return true;
      }

      const trimmed = line.trim();

      if (!insideModel || trimmed === '' || /^(\/\/|@@)/.test(trimmed)) {
        return true;
      }

      const name = trimmed.split(/\s+/)[0]!;
      const type = referencedType(line);

      if (addedFieldNames.has(name)) {
        return false;
      }

      return (
        type === undefined ||
        scalars.has(type.replace(/\(.*$/, '')) ||
        kernelTypes.has(type)
      );
    })
    .join('\n');
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Moves a project still on a single prisma/schema.prisma onto the folder, and
 * points prisma.config.ts and package.json at it. Returns the files it wrote,
 * or would write; nothing once the folder is there.
 */
export async function schemaOwners(
  reference: string,
  modules: LoadedModule[],
): Promise<SchemaOwners> {
  const kernelSource = readFileSync(
    path.join(reference, KERNEL_SCHEMA_SOURCE),
    'utf8',
  );
  const files = new Map<string, string>();

  for (const module of modules) {
    for (const record of await recordPatches(module)) {
      for (const name of record.marks.flatMap(
        (mark) => /^model (\w+) \{$/.exec(mark)?.[1] ?? [],
      )) {
        files.set(name, record.file);
      }
    }
  }

  return { kernel: new Set(modelNamesIn(kernelSource)), files };
}

/**
 * Prisma looks for the migrations of a schema folder inside that folder, so a
 * config that relied on prisma/migrations sitting next to schema.prisma has to
 * name it once the schema moves.
 */
export function withMigrationsPath(config: string): string {
  if (/migrations:\s*\{[^}]*\bpath:/.test(config)) {
    return config;
  }

  if (/migrations:\s*\{/.test(config)) {
    return config.replace(
      /migrations:\s*\{/,
      (opening) => `${opening}\n    path: '${MIGRATIONS_FOLDER}',`,
    );
  }

  return config.replace(
    /(schema:\s*(['"])prisma\/schema\2,)/,
    `$1\n  migrations: { path: '${MIGRATIONS_FOLDER}' },`,
  );
}

export function hasLegacySchema(root: string): boolean {
  return (
    existsSync(path.join(root, LEGACY_SCHEMA)) &&
    !existsSync(path.join(root, PRISMA_SCHEMA_FOLDER))
  );
}

export function migrateSchemaFolder(
  root: string,
  owners: SchemaOwners,
  options: { write: boolean },
): string[] {
  const legacy = path.join(root, LEGACY_SCHEMA);

  if (!hasLegacySchema(root)) {
    return [];
  }

  const changed: string[] = [LEGACY_SCHEMA];
  const parts = splitSchema(readFileSync(legacy, 'utf8'), owners);

  for (const [file, content] of parts) {
    changed.push(file);

    if (options.write) {
      const target = path.join(root, file);

      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }

  if (options.write) {
    rmSync(legacy);
  }

  for (const file of [PRISMA_CONFIG, PACKAGE_MANIFEST]) {
    const target = path.join(root, file);

    if (!existsSync(target)) {
      continue;
    }

    const source = readFileSync(target, 'utf8');
    const repointed = source.replace(
      /(['"])prisma\/schema\.prisma\1/g,
      `$1${PRISMA_SCHEMA_FOLDER}$1`,
    );
    const pointed =
      file === PRISMA_CONFIG ? withMigrationsPath(repointed) : repointed;

    if (pointed !== source) {
      changed.push(relative(root, target));

      if (options.write) {
        writeFileSync(target, pointed);
      }
    }
  }

  return changed;
}
