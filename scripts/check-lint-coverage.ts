import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..');

const SKIPPED_DIRECTORIES = new Set([
  '.astro',
  '.git',
  '.github',
  'coverage',
  'dist',
  'node_modules',
]);

const LINTED_EXTENSIONS = ['.ts', '.tsx'];

// Roots no linter reaches at all, each with the reason. This is recorded debt,
// not a licence: a root only belongs here until it carries a linter of its own,
// and nothing new should ever be added.
const UNCOVERED_ROOTS = new Map([
  ['docs', 'Astro workspace, ships its own toolchain'],
]);

function lintScript(): string {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string | undefined> };
  const script = manifest.scripts?.lint;

  if (!script) {
    throw new Error('No lint script in package.json');
  }

  return script;
}

function lintPatterns(script: string): string[] {
  const patterns = [...script.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((pattern): pattern is string => pattern !== undefined);

  if (patterns.length === 0) {
    throw new Error(`No quoted pattern in the lint script: ${script}`);
  }

  return patterns;
}

// A brace list of roots plus a suffix pattern is the only glob shape used here,
// so the roots are all that has to be understood to know what gets linted.
function rootsOf(pattern: string): string[] {
  const braced = /^\{([^}]+)\}/.exec(pattern)?.[1];

  if (braced) {
    return braced.split(',');
  }

  const firstSegment = pattern.includes('/')
    ? pattern.slice(0, pattern.indexOf('/'))
    : pattern;

  return [firstSegment];
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : walk(path.join(dir, entry.name));
    }

    return [path.join(dir, entry.name)];
  });
}

// A workspace with its own eslint config is linted by its own run, chained from
// the root script so there is a single entry point. The delegation is verified
// rather than trusted: a workspace named here without a config would claim a
// coverage it does not have.
function delegatedRoots(script: string): Set<string> {
  const names = [...script.matchAll(/--filter\s+(\S+)\s+lint/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);

  for (const name of names) {
    if (!existsSync(path.join(root, name, 'eslint.config.mjs'))) {
      throw new Error(
        `The lint script delegates to ${name}, which has no eslint.config.mjs`,
      );
    }
  }

  return new Set(names);
}

const script = lintScript();
const patterns = lintPatterns(script);
const globbedRoots = new Set([
  ...patterns.filter((pattern) => pattern.includes('*')).flatMap(rootsOf),
  ...delegatedRoots(script),
]);
const namedFiles = new Set(
  patterns.filter((pattern) => !pattern.includes('*')),
);

const sources = walk(root)
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  .filter(
    (file) =>
      LINTED_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
      !file.endsWith('.d.ts'),
  );

const uncovered: string[] = [];
const debt = new Map<string, number>();

for (const file of sources) {
  const firstSegment = file.includes('/')
    ? file.slice(0, file.indexOf('/'))
    : file;

  if (UNCOVERED_ROOTS.has(firstSegment)) {
    debt.set(firstSegment, (debt.get(firstSegment) ?? 0) + 1);
    continue;
  }

  if (!globbedRoots.has(firstSegment) && !namedFiles.has(file)) {
    uncovered.push(file);
  }
}

for (const [rootName, reason] of UNCOVERED_ROOTS) {
  const count = debt.get(rootName) ?? 0;

  if (count > 0) {
    console.log(`! ${rootName}: ${count} files unlinted (${reason})`);
  }
}

if (uncovered.length > 0) {
  console.error('\nFiles no linter reaches:\n');
  uncovered.forEach((file) => console.error(`  ${file}`));
  console.error(
    `\nThe lint script matches ${patterns.join(' ')}. A file outside it is never\nchecked, and nothing says so: it just stops being verified the day the\nglob changes.`,
  );
  process.exit(1);
}

console.log(
  `✔ every source file is reached by a linter (${sources.length} files checked)`,
);
