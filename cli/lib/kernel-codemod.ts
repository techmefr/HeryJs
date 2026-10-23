import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  KERNEL_PACKAGE,
  KERNEL_PACKAGE_SPECIFIER,
  KERNEL_PUBLIC_ENTRIES,
  KERNEL_PUBLIC_SPECIFIER,
} from './kernel-public-api';

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.astro', '.git']);

const PUBLIC_LITERAL = new RegExp(
  `(['"])${KERNEL_PUBLIC_SPECIFIER}(${KERNEL_PUBLIC_ENTRIES.join('|')})\\1`,
  'g',
);

const KERNEL_PATH = /^([ \t]*)"#kernel\/\*"\s*:\s*\[\s*"([^"]*)\*"\s*\]/m;
const PACKAGE_PATH_KEY = `"${KERNEL_PACKAGE_SPECIFIER}*"`;

/**
 * Mirrors what the package-manifests check calls shipped: a peer only the
 * specs need is not one the installing project has to provide.
 */
function isTestOnly(file: string): boolean {
  return (
    /\.(spec|integration-spec|e2e-spec|fakes|factory)\.ts$/.test(file) ||
    file.endsWith('.d.ts')
  );
}

export function rewriteKernelImports(source: string): string {
  return source.replace(PUBLIC_LITERAL, `$1${KERNEL_PACKAGE_SPECIFIER}$2$1`);
}

/**
 * Maps `@heryjs/core/*` next to the `#kernel/*` path a module's tsconfig
 * already has, to the public folder of the same kernel. `#kernel/*` stays: a
 * module still reaches the files it installs into a kernel folder through it.
 */
export function rewriteTsconfigPaths(source: string): string {
  if (source.includes(PACKAGE_PATH_KEY)) {
    return source;
  }

  return source.replace(
    KERNEL_PATH,
    (match, indent: string, target: string) =>
      `${indent}${PACKAGE_PATH_KEY}: ["${target}public/*"],\n${match}`,
  );
}

function sortedEntries(
  entries: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * A workspace range is only resolvable where `@heryjs/core` is a workspace
 * member, which is also where it has to be installed for the build: the dev
 * dependency comes with it, the way module packages already list `heryjs`.
 */
export function withKernelPeer(source: string, range: string): string {
  const manifest = JSON.parse(source) as Record<string, unknown>;
  const peers = (manifest.peerDependencies ?? {}) as Record<string, string>;

  if (peers[KERNEL_PACKAGE] !== undefined) {
    return source;
  }

  manifest.peerDependencies = sortedEntries({
    ...peers,
    [KERNEL_PACKAGE]: range,
  });

  if (range.startsWith('workspace:')) {
    manifest.devDependencies = sortedEntries({
      ...((manifest.devDependencies ?? {}) as Record<string, string>),
      [KERNEL_PACKAGE]: 'workspace:*',
    });
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : filesUnder(full);
    }

    return [full];
  });
}

function importsKernelPackage(source: string): boolean {
  return (
    source.includes(`'${KERNEL_PACKAGE_SPECIFIER}`) ||
    source.includes(`"${KERNEL_PACKAGE_SPECIFIER}`)
  );
}

export interface KernelMigrationOptions {
  /** Declares `@heryjs/core` at this range in each package that ships an import of it. */
  peerRange?: string;
  /** False reports what would change and writes nothing. */
  write?: boolean;
}

/**
 * Moves a project's module packages from `#kernel/public/<entry>` to
 * `@heryjs/core/<entry>`. Every step rewrites only what is still in the old
 * form, so a second run changes nothing. Returns the files it changed, or
 * would change, relative to `root`.
 */
export function migrateKernelImports(
  root: string,
  targets: string[],
  options: KernelMigrationOptions = {},
): string[] {
  const write = options.write ?? true;
  const changed: string[] = [];
  const contents = new Map<string, string>();

  const update = (file: string, next: string): void => {
    if (next !== (contents.get(file) ?? readFileSync(file, 'utf8'))) {
      changed.push(path.relative(root, file));

      if (write) {
        writeFileSync(file, next);
      }
    }

    contents.set(file, next);
  };

  const files = targets.flatMap((target) =>
    filesUnder(path.resolve(root, target)),
  );

  for (const file of files) {
    const name = path.basename(file);

    if (name.endsWith('.ts')) {
      update(file, rewriteKernelImports(readFileSync(file, 'utf8')));
    } else if (/^tsconfig.*\.json$/.test(name)) {
      update(file, rewriteTsconfigPaths(readFileSync(file, 'utf8')));
    }
  }

  if (options.peerRange !== undefined) {
    for (const manifest of files.filter(
      (file) => path.basename(file) === 'package.json',
    )) {
      const packageDir = path.dirname(manifest);
      const ships = files.some(
        (file) =>
          file.startsWith(path.join(packageDir, 'src') + path.sep) &&
          file.endsWith('.ts') &&
          !isTestOnly(file) &&
          importsKernelPackage(contents.get(file) ?? ''),
      );

      if (ships) {
        update(
          manifest,
          withKernelPeer(readFileSync(manifest, 'utf8'), options.peerRange),
        );
      }
    }
  }

  return [...new Set(changed)].sort();
}
