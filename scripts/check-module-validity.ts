import pc from 'picocolors';
import * as path from 'node:path';
import { loadOfficialModules } from '../cli/lib/module-discovery';
import {
  unloadablePackages,
  validateModule,
} from '../cli/lib/module-validation';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * The same checks `hery module:validate` runs, over the modules this repo
 * ships. A third-party author runs that command on their own package; this is
 * what keeps the eleven written here from drifting away from what it demands
 * of everyone else.
 */
export function checkModuleValidity(): boolean {
  const modules = loadOfficialModules();
  const failing = modules.filter((module) => {
    const problems = validateModule(module);

    problems.forEach((problem) => {
      console.error(pc.red(`✖ ${module.name} ${problem}`));
    });

    return problems.length > 0;
  });

  const unloadable = unloadablePackages(
    path.join(REPO_ROOT, 'packages'),
    modules,
  );

  unloadable.forEach((dir) => {
    console.error(pc.red(`✖ ${dir} holds a module the loader cannot load`));
  });

  if (failing.length > 0 || unloadable.length > 0) {
    console.error(
      '\nRun "pnpm hery module:validate <name>" to see one module on its own.',
    );

    return false;
  }

  console.log(
    pc.green(`✔ ${modules.length} modules satisfy the authoring contract`),
  );

  return true;
}
