import { readdirSync } from 'node:fs';
import * as path from 'node:path';

const SKIPPED_DIRECTORIES = new Set([
  '.astro',
  '.git',
  '.github',
  '.hery',
  'coverage',
  'dist',
  'node_modules',
]);

export function walkFiles(
  dir: string,
  matches: (name: string) => boolean,
): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : walkFiles(path.join(dir, entry.name), matches);
    }

    return matches(entry.name) ? [path.join(dir, entry.name)] : [];
  });
}
