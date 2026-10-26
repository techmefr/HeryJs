import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  readPrismaSchema,
  schemaFileDeclaring,
} from '@heryjs/core/technical/prisma/schema-files';
import type { ResourceContext } from './resource-context';
import { prismaModelBlock } from './templates';

export const PRISMA_SCHEMA_FOLDER = 'prisma/schema';
export const KERNEL_SCHEMA = `${PRISMA_SCHEMA_FOLDER}/_hery/core.prisma`;
export const APP_SCHEMA = `${PRISMA_SCHEMA_FOLDER}/app.prisma`;

export function moduleSchemaFile(moduleName: string): string {
  return `${PRISMA_SCHEMA_FOLDER}/${moduleName}.prisma`;
}

const MODEL_DECLARATION = /^model\s+(\w+)\s*\{/gm;

export function modelNamesIn(source: string): string[] {
  return [...source.matchAll(MODEL_DECLARATION)].map((match) => match[1] ?? '');
}

/**
 * Appends whole model blocks a module owns outright -- a MailLog, a
 * WebhookEndpoint -- to the end of its schema file, creating it on the first
 * install. Guarded on any of their names already being declared, in that file
 * or in the rest of the schema when it is given, so a second install is a
 * no-op.
 */
export function addPrismaModels(
  filePath: string,
  models: string,
  schema?: string,
): boolean {
  const names = modelNamesIn(models);

  if (names.length === 0) {
    throw new Error('addPrismaModels was given no model block');
  }

  const source = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const declared = `${source}\n${schema ?? ''}`;

  if (names.some((name) => declared.includes(`model ${name} {`))) {
    return false;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    source === '' ? models.trimStart() : `${source.trimEnd()}\n${models}`,
  );
  return true;
}

/**
 * Takes back what addModelFields wrote: the lines of the model declaring each
 * field name. prisma format realigns a block whenever it changes, so a field is
 * found by its name, the one part of the line that survives being written.
 */
export function removeModelFields(
  filePath: string,
  modelName: string,
  fieldLines: string[],
): boolean {
  const source = readFileSync(filePath, 'utf8');
  const start = source.indexOf(`model ${modelName} {`);

  if (start === -1) {
    return false;
  }

  const close = source.indexOf('\n}', start);
  const names = new Set(fieldLines.map((line) => line.trim().split(/\s+/)[0]));
  const block = source.slice(start, close);
  const kept = block
    .split('\n')
    .filter(
      (line, index) => index === 0 || !names.has(line.trim().split(/\s+/)[0]),
    );

  if (kept.length === block.split('\n').length) {
    return false;
  }

  writeFileSync(
    filePath,
    source.slice(0, start) + kept.join('\n') + source.slice(close),
  );
  return true;
}

/**
 * Adds field lines to an existing model block, for a module whose runtime
 * needs a column on a model it does not own (impersonation needs `role` on
 * `User`, which belongs to the kernel's auth schema, not to the module).
 * Guarded on the first field already being present, so a second install is a
 * no-op.
 */
export function addModelFields(
  filePath: string,
  modelName: string,
  fieldLines: string[],
): boolean {
  const source = readFileSync(filePath, 'utf8');
  const start = source.indexOf(`model ${modelName} {`);

  if (start === -1) {
    throw new Error(`Could not find "model ${modelName}" in ${filePath}`);
  }

  const close = source.indexOf('\n}', start);
  const guard = fieldLines[0];

  if (guard === undefined) {
    throw new Error('addModelFields was given no field lines');
  }

  if (source.slice(start, close).includes(guard.trim())) {
    return false;
  }

  // Timestamps are conventionally the last scalars before the blank line that
  // separates them from relations, so a new scalar field belongs right before
  // them -- never after the relations, and never after createdAt/updatedAt.
  const timestamps = source.indexOf('\n  createdAt', start);
  const blankLine = source.indexOf('\n\n', start);
  const insertAt =
    timestamps !== -1 && timestamps < close
      ? timestamps
      : blankLine !== -1 && blankLine < close
        ? blankLine
        : close;

  const patched =
    source.slice(0, insertAt) +
    '\n' +
    fieldLines.join('\n') +
    source.slice(insertAt);
  writeFileSync(filePath, patched);
  return true;
}

/**
 * Exact-match string replacement for kernel files a module needs to extend --
 * a new plugin registered, a new field threaded through the session. Each
 * pair is `[search, replace]`; the whole patch is skipped once `guardText` is
 * already present, so re-running `hery install` twice is a no-op.
 */
export function patchExactStrings(
  filePath: string,
  pairs: Array<[string, string]>,
  guardText: string,
): boolean {
  const source = readFileSync(filePath, 'utf8');

  if (source.includes(guardText)) {
    return false;
  }

  let patched = source;

  for (const [search, replace] of pairs) {
    if (!patched.includes(search)) {
      throw new Error(
        `Could not find ${JSON.stringify(search)} in ${filePath}`,
      );
    }

    patched = patched.replace(search, replace);
  }

  writeFileSync(filePath, patched);
  return true;
}

function withBackRelation(
  source: string,
  model: string,
  ctx: ResourceContext,
  filePath: string,
): string {
  const start = source.indexOf(`model ${model} {`);

  if (start === -1) {
    throw new Error(`Could not find "model ${model}" in ${filePath}`);
  }

  const end = source.indexOf('\n}', start);
  const relation = `  ${ctx.pluralCamelName} ${ctx.pascalName}[]`;

  return source.slice(0, end) + '\n' + relation + source.slice(end);
}

/**
 * Writes a generated model into the project's own schema file, and its
 * back-relations into whichever file declares User and Team -- the kernel's,
 * since Prisma wants both ends of a relation declared. Returns the files it
 * wrote, none when the model is already declared.
 */
export function patchPrismaSchema(
  root: string,
  ctx: ResourceContext,
): string[] {
  if ((readPrismaSchema(root) ?? '').includes(`model ${ctx.pascalName} {`)) {
    return [];
  }

  // A team-owned resource points at Team, and Prisma requires the other end of
  // that relation to be declared too.
  const owners = Object.values(ctx.permissions).includes('team')
    ? ['User', 'Team']
    : ['User'];
  const touched = new Set<string>();

  for (const owner of owners) {
    const file = schemaFileDeclaring(root, owner);

    if (file === undefined) {
      throw new Error(
        `Could not find "model ${owner}" in ${PRISMA_SCHEMA_FOLDER}`,
      );
    }

    writeFileSync(
      file,
      withBackRelation(readFileSync(file, 'utf8'), owner, ctx, file),
    );
    touched.add(file);
  }

  const appSchema = path.join(root, APP_SCHEMA);
  const current = existsSync(appSchema) ? readFileSync(appSchema, 'utf8') : '';

  writeFileSync(
    appSchema,
    current === ''
      ? prismaModelBlock(ctx).trimStart()
      : `${current.trimEnd()}\n${prismaModelBlock(ctx)}`,
  );
  touched.add(appSchema);

  return [...touched];
}
