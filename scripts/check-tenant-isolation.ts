import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { checkTenantIsolation as checkModules } from '@heryjs/core/conventions';
import { loadOfficialModules } from '../cli/lib/module-discovery';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Both copies of a module are checked, the authored one under packages/ and
 * the installed one, so an installed module cannot lose the proof its package
 * still has. A module whose destination is a shared kernel directory owns no
 * folder of its own there, so only its package copy is checked.
 */
export function checkTenantIsolation(): boolean {
  const directories = loadOfficialModules().flatMap((module) => {
    const installed = path.resolve(REPO_ROOT, module.dest);
    const ownsItsDestination = !module.dest.startsWith('src/technical');

    return ownsItsDestination && existsSync(installed)
      ? [module.packageDir, installed]
      : [module.packageDir];
  });

  return checkModules(REPO_ROOT, directories);
}
