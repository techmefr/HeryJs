import pc from 'picocolors';
import { satisfies, validRange } from 'semver';
import type { LoadedModule } from './module-definition';
import { KERNEL_VERSION } from './kernel-version';

/**
 * Why this runs before `install()` rather than after: a module does not stay
 * resident, it writes files the project then owns. There is no later moment
 * where an incompatibility surfaces as a recoverable error -- it surfaces as
 * source code written against a kernel that has moved, already merged, already
 * edited. So the range is checked while nothing has been written yet.
 */
export function compatibilityProblem(
  range: string,
  kernelVersion: string = KERNEL_VERSION,
): string | undefined {
  if (validRange(range) === null) {
    return `declares meta.compatibility "${range}", which is not a semver range`;
  }

  if (!satisfies(kernelVersion, range, { includePrerelease: true })) {
    return `was written for HeryJs ${range}, and this project is on ${kernelVersion}`;
  }

  return undefined;
}

/**
 * Filters out what must not be installed, before the first dependency is
 * added and the first file is written, because an install is not something the
 * developer can roll back: the module leaves code behind and disappears.
 * `force` is what makes the refusal a decision rather than a wall -- the files
 * land, and the developer owns them.
 */
export function installableModules(
  modules: LoadedModule[],
  force: boolean,
): LoadedModule[] {
  return modules.filter((module) => {
    const problem = compatibilityProblem(module.meta.compatibility);

    if (problem === undefined) {
      return true;
    }

    if (force) {
      console.log(pc.yellow(`! ${module.name} ${problem}, installing anyway`));
      return true;
    }

    console.log(pc.red(`✖ ${module.name} ${problem}`));
    console.log(
      pc.red('    install it with --force if you mean to take that on'),
    );
    process.exitCode = 1;

    return false;
  });
}
