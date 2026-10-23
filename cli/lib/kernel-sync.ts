import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { mergeKernelSchema, schemasDiffer } from '@heryjs/cli/sync';
import { KERNEL_PACKAGE } from './kernel-public-api';
import { KERNEL_SCHEMA } from './schema-patch';

export const PACKAGED_KERNEL_SCHEMA = path.join('prisma', 'core.prisma');

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
 * what the project and its modules hang on the kernel's models. Returns
 * whether it differed; it writes only when asked to and when it did.
 */
export function syncKernelSchema(
  root: string,
  packaged: string,
  { write }: { write: boolean },
): boolean {
  const target = path.join(root, KERNEL_SCHEMA);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const merged = mergeKernelSchema(packaged, current);

  if (!schemasDiffer(merged, current)) {
    return false;
  }

  if (write) {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, merged);
  }

  return true;
}
