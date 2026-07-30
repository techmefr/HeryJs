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

// Every extension a linter is expected to reach. Coverage is read per extension
// and not once for the whole tree, because a glob that names a root still leaves
// a file type inside it unchecked, and that is the failure this check exists for.
const LINTABLE_EXTENSIONS = [
  '.astro',
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
];

// Roots no linter reaches at all, each with the reason. This is recorded debt,
// not a licence: a root only belongs here until it carries a linter of its own,
// and nothing new should ever be added.
const UNCOVERED_ROOTS = new Map([
  ['docs', 'Astro workspace, ships its own toolchain'],
]);

// The same debt one level down: a file type left out wherever it sits, because
// the tool that reads it is the one that validates it.
const UNCOVERED_EXTENSIONS = new Map([
  ['.cjs', 'tool configuration, read by the tool that owns it'],
  ['.mjs', 'flat config files, read by eslint and astro themselves'],
]);

interface LintedGlob {
  prefix: string;
  extensions: Set<string>;
}

function scriptOf(workspace: string): string {
  const manifest = path.join(root, workspace, 'package.json');
  const scripts = existsSync(manifest)
    ? (
        JSON.parse(readFileSync(manifest, 'utf8')) as {
          scripts?: Record<string, string | undefined>;
        }
      ).scripts
    : undefined;
  const script = scripts?.lint;

  if (!script) {
    throw new Error(
      workspace
        ? `The lint script delegates to ${workspace}, which has no lint script`
        : 'No lint script in package.json',
    );
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

// A glob with no extension suffix hands the choice back to the linter, which
// then reads whatever its own config declares, so it counts as reaching all of
// them rather than none.
function extensionsOf(pattern: string): string[] {
  const suffix = /\*\.(\{[^}]+\}|[A-Za-z0-9]+)$/.exec(pattern)?.[1];

  if (suffix === undefined) {
    return LINTABLE_EXTENSIONS;
  }

  const braced = /^\{(.+)\}$/.exec(suffix)?.[1];

  return (braced ? braced.split(',') : [suffix]).map(
    (name) => '.' + name.trim(),
  );
}

function globsOf(script: string, workspace = ''): LintedGlob[] {
  return lintPatterns(script)
    .filter((pattern) => pattern.includes('*'))
    .flatMap((pattern) => {
      const extensions = new Set(extensionsOf(pattern));

      return rootsOf(pattern).map((name) => ({
        prefix: workspace ? `${workspace}/${name}` : name,
        extensions,
      }));
    });
}

function namedFilesOf(script: string, workspace = ''): string[] {
  return lintPatterns(script)
    .filter((pattern) => !pattern.includes('*'))
    .map((pattern) => (workspace ? `${workspace}/${pattern}` : pattern));
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
// rather than trusted: a workspace named here without a config, or without a
// lint script to run, would claim a coverage it does not have.
function delegatedScripts(script: string): Map<string, string> {
  const names = [...script.matchAll(/--filter\s+(\S+)\s+lint/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);

  return new Map(
    names.map((name) => {
      if (!existsSync(path.join(root, name, 'eslint.config.mjs'))) {
        throw new Error(
          `The lint script delegates to ${name}, which has no eslint.config.mjs`,
        );
      }

      return [name, scriptOf(name)];
    }),
  );
}

function bracedList(values: string[]): string {
  return values.length === 1 ? values.join('') : `{${values.join(',')}}`;
}

function reachOf(globs: LintedGlob[], namedFiles: Set<string>): string {
  const prefixes = new Map<string, string[]>();

  for (const glob of globs) {
    const key = bracedList(
      [...glob.extensions].map((extension) => extension.slice(1)).sort(),
    );

    prefixes.set(key, [...(prefixes.get(key) ?? []), glob.prefix]);
  }

  return [
    ...[...prefixes].map(
      ([extensions, roots]) => `${bracedList(roots)}/**/*.${extensions}`,
    ),
    ...namedFiles,
  ].join(' ');
}

export function checkLintCoverage(): boolean {
  const script = scriptOf('');
  const delegated = [...delegatedScripts(script)];
  const globs = [
    ...globsOf(script),
    ...delegated.flatMap(([name, own]) => globsOf(own, name)),
  ];
  const namedFiles = new Set([
    ...namedFilesOf(script),
    ...delegated.flatMap(([name, own]) => namedFilesOf(own, name)),
  ]);

  const sources = walk(root)
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter(
      (file) =>
        LINTABLE_EXTENSIONS.includes(path.extname(file)) &&
        !file.endsWith('.d.ts'),
    );

  const reached: string[] = [];
  const uncovered: string[] = [];
  const rootDebt = new Map<string, number>();
  const extensionDebt = new Map<string, number>();

  for (const file of sources) {
    const extension = path.extname(file);
    const covered = globs.some(
      (glob) =>
        file.startsWith(`${glob.prefix}/`) && glob.extensions.has(extension),
    );

    if (covered || namedFiles.has(file)) {
      reached.push(file);
      continue;
    }

    const firstSegment = file.includes('/')
      ? file.slice(0, file.indexOf('/'))
      : file;

    if (UNCOVERED_ROOTS.has(firstSegment)) {
      rootDebt.set(firstSegment, (rootDebt.get(firstSegment) ?? 0) + 1);
      continue;
    }

    if (UNCOVERED_EXTENSIONS.has(extension)) {
      extensionDebt.set(extension, (extensionDebt.get(extension) ?? 0) + 1);
      continue;
    }

    uncovered.push(file);
  }

  for (const [debt, reasons] of [
    [rootDebt, UNCOVERED_ROOTS],
    [extensionDebt, UNCOVERED_EXTENSIONS],
  ] as const) {
    for (const [name, reason] of reasons) {
      const count = debt.get(name) ?? 0;

      if (count > 0) {
        const files = count === 1 ? 'file' : 'files';

        console.log(`! ${name}: ${count} ${files} unlinted (${reason})`);
      }
    }
  }

  if (uncovered.length > 0) {
    const types = [...new Set(uncovered.map((file) => path.extname(file)))];

    console.error('\nFiles no linter reaches:\n');

    for (const type of types.sort()) {
      console.error(`  ${type}`);
      uncovered
        .filter((file) => path.extname(file) === type)
        .forEach((file) => console.error(`    ${file}`));
    }

    console.error(
      `\nThe lint globs reach ${reachOf(globs, namedFiles)}. A file outside them,\nor a file type none of them names, is never checked and nothing says so: it\njust stops being verified the day the glob changes.`,
    );
    return false;
  }

  const types = [...new Set(reached.map((file) => path.extname(file)))].sort();

  console.log(
    `✔ every source file is reached or recorded (${reached.length} reached across ${types.join(', ')}, ${sources.length - reached.length} recorded as debt)`,
  );

  return true;
}
