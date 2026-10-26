import { existsSync } from 'node:fs';
import * as path from 'node:path';

const MARKERS = [['packages', 'cli', 'src', 'hery.ts'], ['templates']];

/**
 * The directory holding everything `hery new` copies into a fresh project.
 *
 * It cannot be a fixed number of levels above `__dirname`: from source the
 * caller sits at `packages/cli/src/commands/`, and from the published package
 * the compiled scaffolder sits deeper under `dist/`. So it is found by walking
 * up to the markers instead -- the CLI's sources next to `templates/`, both of
 * which travel in the published payload. A generated project has neither: its
 * CLI is the installed `@heryjs/cli`, and it is not a payload.
 */
export function findFrameworkRoot(
  from: string = __dirname,
): string | undefined {
  let directory = from;

  for (;;) {
    if (
      MARKERS.every((marker) => existsSync(path.join(directory, ...marker)))
    ) {
      return directory;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

export function frameworkRoot(from: string = __dirname): string {
  const root = findFrameworkRoot(from);

  if (root === undefined) {
    throw new Error(
      `Could not find the HeryJs payload above ${from} — no directory holds both packages/cli/src/hery.ts and templates/.`,
    );
  }

  return root;
}
