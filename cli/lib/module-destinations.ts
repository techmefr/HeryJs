import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import type { LoadedModule } from './module-definition';
import type { PatchRecord } from './module-patches';

export const KERNEL_DIR = 'src/technical';

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function isUnderKernel(file: string): boolean {
  const normalized = path.posix.normalize(file.split(path.sep).join('/'));

  return normalized === KERNEL_DIR || normalized.startsWith(`${KERNEL_DIR}/`);
}

/**
 * Everything a module's install would write into the kernel: its `dest`, each
 * runtime file once copied there, and each file it patches. The kernel is
 * becoming a package a project imports rather than copies, so a module extends
 * it through what `@heryjs/core` exposes, never by landing files inside it.
 */
export function kernelWritesOf(
  module: Pick<LoadedModule, 'name' | 'dest' | 'packageDir'>,
  patches: readonly PatchRecord[],
): string[] {
  const runtimeDir = path.join(module.packageDir, 'src', 'runtime');
  const problems: string[] = [];

  if (isUnderKernel(module.dest)) {
    problems.push(
      `${module.name}: dest "${module.dest}" is inside ${KERNEL_DIR}`,
    );
  }

  for (const file of filesUnder(runtimeDir)) {
    const landing = path.join(module.dest, path.relative(runtimeDir, file));

    if (!isUnderKernel(module.dest) && isUnderKernel(landing)) {
      problems.push(`${module.name}: installs ${landing} inside ${KERNEL_DIR}`);
    }
  }

  for (const patch of patches) {
    if (isUnderKernel(patch.file)) {
      problems.push(
        `${module.name}: patches ${patch.file} inside ${KERNEL_DIR}`,
      );
    }
  }

  return problems;
}
