import { existsSync } from 'node:fs';
import * as path from 'node:path';

const MARKERS = [['cli', 'hery.ts'], ['packages']];

/**
 * The directory holding everything `hery new` copies into a fresh project.
 *
 * It cannot be a fixed number of levels above `__dirname`: from source the
 * caller sits at `cli/commands/`, and from the published package the compiled
 * scaffolder sits two directories deeper under `dist/`. So it is found by
 * walking up to the markers instead -- `cli/hery.ts` next to `packages/`,
 * both of which travel in the published payload and neither of which exists
 * anywhere above it.
 */
export function frameworkRoot(from: string = __dirname): string {
  let directory = from;

  for (;;) {
    if (
      MARKERS.every((marker) => existsSync(path.join(directory, ...marker)))
    ) {
      return directory;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(
        `Could not find the HeryJs payload above ${from} — no directory holds both cli/hery.ts and packages/.`,
      );
    }

    directory = parent;
  }
}
