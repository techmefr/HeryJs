import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { checkTenantIsolation as checkModules } from '@heryjs/core/conventions';
import { loadOfficialModules } from '../packages/cli/src/lib/module-discovery';

const REPO_ROOT = path.resolve(__dirname, '..');

function holdsRuntimeCopy(dir: string): boolean {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).some(
    (entry) => entry.isFile() && !entry.name.endsWith('.spec.ts'),
  );
}

/**
 * Both copies of a module are checked, the authored one under packages/ and
 * an installed one, so an installed module cannot lose the proof its package
 * still has. This repository runs its modules from their packages, and what
 * is left under src/modules is the specs that boot the app, not a copy. A
 * module whose destination is a shared kernel directory owns no folder of its
 * own there, so only its package copy is checked.
 */
export function checkTenantIsolation(): boolean {
  const directories = loadOfficialModules().flatMap((module) => {
    const installed = path.resolve(REPO_ROOT, module.dest);
    const ownsItsDestination = !module.dest.startsWith('src/technical');

    return ownsItsDestination &&
      existsSync(installed) &&
      holdsRuntimeCopy(installed)
      ? [module.packageDir, installed]
      : [module.packageDir];
  });

  return checkModules(REPO_ROOT, directories);
}
