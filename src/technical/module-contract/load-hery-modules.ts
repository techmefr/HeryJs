import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { HeryConfigModuleEntry } from '../config/hery-config.types';
import type { HeryModuleContract } from './hery-module.contract';

export const HERY_ENTRY = 'hery';

type Loader = (specifier: string) => unknown;

function isMissing(error: unknown, specifier: string): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
    error.message.includes(specifier)
  );
}

/**
 * The contract each module of hery.config.ts exports as `<package>/hery`,
 * loaded by its name from the application's own dependencies. A module that
 * is not installed is left out, so resolveHeryModules names it with the rest.
 */
export function loadHeryModules(
  entries: readonly HeryConfigModuleEntry[],
  load: Loader = createRequire(path.join(process.cwd(), 'package.json')),
): HeryModuleContract[] {
  return entries.flatMap((entry) => {
    const name = typeof entry === 'string' ? entry : entry[0];
    const specifier = `${name}/${HERY_ENTRY}`;

    try {
      const loaded = load(specifier) as {
        default?: HeryModuleContract;
      };

      return loaded.default ? [loaded.default] : [];
    } catch (error) {
      if (isMissing(error, specifier)) {
        return [];
      }

      throw error;
    }
  });
}
