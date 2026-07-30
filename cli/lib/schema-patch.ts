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
): void {
  const source = readFileSync(filePath, 'utf8');

  if (source.includes(`model ${ctx.pascalName} {`)) {
    return;
  }

  let patched = withBackRelation(source, 'User', ctx, filePath);

  // A team-owned resource points at Team, and Prisma requires the other end of
  // that relation to be declared too.
  if (Object.values(ctx.permissions).includes('team')) {
    patched = withBackRelation(patched, 'Team', ctx, filePath);
  }

  writeFileSync(filePath, `${patched}\n${prismaModelBlock(ctx)}`);
}
