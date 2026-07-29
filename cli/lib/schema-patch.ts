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

export function patchPrismaSchema(
  filePath: string,
  ctx: ResourceContext,
): void {
  const source = readFileSync(filePath, 'utf8');

  if (source.includes(`model ${ctx.pascalName} {`)) {
    return;
  }

  const userModelStart = source.indexOf('model User {');

  if (userModelStart === -1) {
    throw new Error(`Could not find "model User" in ${filePath}`);
  }

  const userModelEnd = source.indexOf('\n}', userModelStart);
  const relationLine = `  ${ctx.pluralCamelName} ${ctx.pascalName}[]\n`;

  const withRelation =
    source.slice(0, userModelEnd) +
    '\n' +
    relationLine.trimEnd() +
    source.slice(userModelEnd);

  const patched = `${withRelation}\n${prismaModelBlock(ctx)}`;
  writeFileSync(filePath, patched);
}
