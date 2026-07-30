import { readFileSync, writeFileSync } from 'node:fs';
import type { ResourceContext } from './resource-context';
import { prismaModelBlock } from './templates';

export function patchTenantScopedModels(
  filePath: string,
  pascalName: string,
): void {
  const source = readFileSync(filePath, 'utf8');
  const marker = 'const TENANT_SCOPED_MODELS = new Set([';
  const start = source.indexOf(marker);

  if (start === -1) {
    throw new Error(`Could not find TENANT_SCOPED_MODELS in ${filePath}`);
  }

  if (source.includes(`'${pascalName}'`, start)) {
    return;
  }

  const end = source.indexOf(']', start);
  const before = source.slice(0, end);
  const after = source.slice(end);

  const patched = `${before}, '${pascalName}'${after}`;
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
