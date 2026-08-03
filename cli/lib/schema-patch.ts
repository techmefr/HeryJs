import { readFileSync, writeFileSync } from 'node:fs';
import type { ResourceContext } from './resource-context';
import { prismaModelBlock } from './templates';

/**
 * Adds a model name to one of the `new Set([...])` lists the kernel keeps, so a
 * generated resource is tenant-scoped and audited without the developer having
 * to remember two edits in two files.
 */
export function patchModelSet(
  filePath: string,
  setName: string,
  pascalName: string,
): void {
  const source = readFileSync(filePath, 'utf8');
  const marker = `const ${setName} = new Set([`;
  const start = source.indexOf(marker);

  if (start === -1) {
    throw new Error(`Could not find ${setName} in ${filePath}`);
  }

  const end = source.indexOf(']', start);

  if (end === -1) {
    throw new Error(`${setName} in ${filePath} is never closed`);
  }

  if (source.slice(start, end).includes(`'${pascalName}'`)) {
    return;
  }

  const separator =
    source.slice(start + marker.length, end).trim() === '' ? '' : ', ';
  const patched = `${source.slice(0, end)}${separator}'${pascalName}'${source.slice(end)}`;
  writeFileSync(filePath, patched);
}

/**
 * Adds field lines to an existing model block, for a module whose runtime
 * needs a column on a model it does not own (impersonation needs `role` on
 * `User`, which belongs to the kernel's auth schema, not to the module).
 * Guarded on the first field already being present, the same one-check
 * idempotence `patchModelSet` uses.
 */
export function patchModelFields(
  filePath: string,
  modelName: string,
  fieldLines: string[],
): void {
  const source = readFileSync(filePath, 'utf8');
  const start = source.indexOf(`model ${modelName} {`);

  if (start === -1) {
    throw new Error(`Could not find "model ${modelName}" in ${filePath}`);
  }

  const close = source.indexOf('\n}', start);
  const guard = fieldLines[0];

  if (guard === undefined) {
    throw new Error('patchModelFields called with no field lines');
  }

  if (source.slice(start, close).includes(guard.trim())) {
    return;
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
): void {
  const source = readFileSync(filePath, 'utf8');

  if (source.includes(guardText)) {
    return;
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

export function patchPrismaSchema(
  filePath: string,
  ctx: ResourceContext,
): boolean {
  const source = readFileSync(filePath, 'utf8');

  if (source.includes(`model ${ctx.pascalName} {`)) {
    return false;
  }

  let patched = withBackRelation(source, 'User', ctx, filePath);

  // A team-owned resource points at Team, and Prisma requires the other end of
  // that relation to be declared too.
  if (Object.values(ctx.permissions).includes('team')) {
    patched = withBackRelation(patched, 'Team', ctx, filePath);
  }

  writeFileSync(filePath, `${patched}\n${prismaModelBlock(ctx)}`);
  return true;
}
