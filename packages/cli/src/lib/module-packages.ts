import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { workspaceModules } from './module-runtime-copies';
import { copyRuntime } from './runtime-copy';

const MODULE_SPECIFIERS = '^#modules/([^/]+)/(.*)$';

interface ModuleManifest {
  dependencies?: Record<string, string>;
}

/**
 * A project's manifest, installing each module this repository takes from its
 * workspace from the package `dependencyOf` names instead: the project
 * imports its modules, it no longer carries their runtime.
 */
export function withModulePackages<T extends ModuleManifest>(
  manifest: T,
  dependencyOf: (name: string) => string,
): T {
  const copy = structuredClone(manifest);

  for (const name of workspaceModules(copy.dependencies)) {
    copy.dependencies![`@heryjs/${name}`] = dependencyOf(name);
  }

  return copy;
}

/**
 * Points jest's `#modules/` at the installed packages, the way node resolves
 * it through the project's `imports`, and drops the mappers onto this
 * repository's package sources.
 */
export function withPackagedModuleMapper(
  mapper: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapper).flatMap(([pattern, target]): [string, string][] => {
      if (pattern.startsWith('^@heryjs/(?!core/|cli/)')) {
        return [];
      }

      if (pattern.startsWith('^#modules/')) {
        return [[MODULE_SPECIFIERS, '@heryjs/$1/$2']];
      }

      return [[pattern, target]];
    }),
  );
}

/** Whether a module is read from an installed package rather than a workspace. */
export function isInstalledPackage(packageDir: string): boolean {
  const real = existsSync(packageDir) ? realpathSync(packageDir) : packageDir;

  return real.split(path.sep).includes('node_modules');
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const sha256 = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

export type ModuleCopyState =
  { copied: false } | { copied: true; modified: string[] };

/**
 * Whether a project still carries a copy of a module at `dest`, and which of
 * its files differ from what `hery install` copies out of `runtimeDir`: a
 * changed file, or one the project added.
 */
export function moduleCopyState(
  root: string,
  dest: string,
  runtimeDir: string,
): ModuleCopyState {
  const copyDir = path.join(root, dest);

  if (!existsSync(copyDir)) {
    return { copied: false };
  }

  const expectedDir = mkdtempSync(path.join(tmpdir(), 'hery-module-runtime-'));

  try {
    if (existsSync(runtimeDir)) {
      copyRuntime(runtimeDir, expectedDir, { quiet: true });
    }

    const modified = filesUnder(copyDir)
      .map((file) => path.relative(copyDir, file))
      .filter((file) => {
        const expected = path.join(expectedDir, file);

        return (
          !existsSync(expected) ||
          sha256(expected) !== sha256(path.join(copyDir, file))
        );
      })
      .sort()
      .map((file) => path.join(dest, file));

    return { copied: true, modified };
  } finally {
    rmSync(expectedDir, { recursive: true, force: true });
  }
}

/** Where the package `@heryjs/<name>` the payload at `payload` depends on lives. */
export function heryPackageDir(payload: string, name: string): string {
  return path.dirname(
    require.resolve(`@heryjs/${name}/package.json`, { paths: [payload] }),
  );
}

/**
 * How a project installs `@heryjs/<name>`: from the framework checkout it was
 * scaffolded off, or at the exact version the published payload came with.
 */
export function heryPackageDependency(payload: string, name: string): string {
  const packageDir = heryPackageDir(payload, name);

  if (!isInstalledPackage(packageDir)) {
    return `file:${realpathSync(packageDir)}`;
  }

  const { version } = JSON.parse(
    readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
  ) as { version: string };

  return version;
}

/**
 * The spec a project adds `@heryjs/<name>` with, next to the `@heryjs/core`
 * it already has: the sibling directory of a local kernel, or the same range.
 */
export function siblingPackageSpec(core: string, name: string): string {
  if (!core.startsWith('file:')) {
    return core;
  }

  return `file:${path.join(path.dirname(core.slice('file:'.length)), name)}`;
}
