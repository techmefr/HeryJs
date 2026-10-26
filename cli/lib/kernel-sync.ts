import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { mergeKernelSchema, schemasDiffer } from '@heryjs/cli/sync';
import { KERNEL_PACKAGE } from './kernel-public-api';
import { KERNEL_SCHEMA } from './schema-patch';

export const PACKAGED_KERNEL_SCHEMA = path.join('prisma', 'core.prisma');

export const KERNEL_SCHEMA_BASE = path.join(
  'prisma',
  'hery-core.synced.prisma',
);

/** The kernel schema of the @heryjs/core the project has installed. */
export function installedKernelSchema(root: string): string {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const installed = path.join(dir, 'node_modules', KERNEL_PACKAGE);

    if (existsSync(path.join(installed, 'package.json'))) {
      return readFileSync(path.join(installed, PACKAGED_KERNEL_SCHEMA), 'utf8');
    }

    if (path.dirname(dir) === dir) {
      throw new Error(
        `${KERNEL_PACKAGE} is not installed in ${root}: run "pnpm install" first.`,
      );
    }
  }
}

/**
 * Brings the project's _hery/core.prisma to the installed kernel's, keeping
 * what the project and its modules hang on the kernel's models and dropping
 * what the kernel removed since the schema it recorded at the last sync.
 * Returns whether it differed; it writes only when asked to.
 */
export function syncKernelSchema(
  root: string,
  packaged: string,
  { write }: { write: boolean },
): boolean {
  const target = path.join(root, KERNEL_SCHEMA);
  const baseFile = path.join(root, KERNEL_SCHEMA_BASE);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const base = existsSync(baseFile) ? readFileSync(baseFile, 'utf8') : '';
  const merged = mergeKernelSchema(packaged, current, base);
  const differed = schemasDiffer(merged, current);

  if (!write) {
    return differed;
  }

  if (differed) {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, merged);
  }

  if (base !== packaged) {
    writeFileSync(baseFile, packaged);
  }

  return differed;
}
