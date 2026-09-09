import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { LoadedModule } from './module-definition';

const IMPORT_SPECIFIER = /(?:from|import|require\()\s*['"]([^'"]+)['"]/g;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function specifiersIn(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)].map(
    (match) => match[1] ?? '',
  );
}

/**
 * A bare specifier is a package: `zod`, `@nestjs/common`, `node:crypto`. What
 * is left after those and the relative ones are the subpath imports, and the
 * only one a module may use is `#kernel/`.
 */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('#');
}

const INCLUDE_LIST = /"include"\s*:\s*\[([^\]]*)\]/;

/**
 * Whether a tsconfig takes a directory in. One with no `include` at all takes
 * the whole package, so only an explicit list can leave something out.
 */
function includes(directory: string, tsconfigSource: string): boolean {
  const list = INCLUDE_LIST.exec(tsconfigSource);

  if (list === null) {
    return true;
  }

  return new RegExp(`["'](?:\\./)?${directory}(?:/|["'])`).test(list[1] ?? '');
}

function runtimeProblems(runtimeDir: string, packageDir: string): string[] {
  const problems: string[] = [];
  const files = filesUnder(runtimeDir);
  const specs = files.filter((file) => file.endsWith('.spec.ts'));

  if (files.length === 0) {
    problems.push('its src/runtime is empty');
    return problems;
  }

  if (files.length === specs.length) {
    problems.push('its src/runtime holds nothing but specs');
  }

  // The one constraint that is about the installing project rather than about
  // this package: copyRuntime copies the spec in with the code, so a module
  // with no spec is a module whose installer has nothing to run.
  if (specs.length === 0) {
    problems.push('it ships no spec under src/runtime');
  }

  for (const file of files.filter((candidate) => candidate.endsWith('.ts'))) {
    const relative = path.relative(packageDir, file);

    for (const specifier of specifiersIn(file)) {
      if (isBareSpecifier(specifier)) {
        continue;
      }

      if (specifier.startsWith('#')) {
        if (!specifier.startsWith('#kernel/')) {
          problems.push(
            `${relative} imports ${specifier} — a module reaches the kernel through #kernel/, which is rewritten to the app's own #technical/ on the way in`,
          );
        }

        continue;
      }

      if (specifier.split('/').includes('..')) {
        problems.push(
          `${relative} imports ${specifier}, which climbs out of the package — nothing above src/runtime is copied into the project`,
        );
      }
    }
  }

  return problems;
}

/**
 * What a module has to satisfy beyond loading, checked from the package alone
 * so a third-party author can run it on their own package with nothing of this
 * project present. Typechecking the runtime is deliberately not here: that is
 * the author's own tsc, against their own tsconfig.
 */
interface ModuleManifest {
  heryjs?: { module?: boolean };
  main?: string;
  files?: string[];
}

/**
 * Whether `files` publishes a path. An entry is a prefix: `dist` ships
 * everything under it. A manifest with no `files` at all publishes whatever
 * npm does not strip, which is not something a module can rely on -- the
 * absence is reported by the caller rather than treated as coverage.
 */
export function publishes(entry: string, files: string[]): boolean {
  return files.some(
    (pattern) => pattern === entry || entry.startsWith(`${pattern}/`),
  );
}

/**
 * What the package has to declare for anyone but its author to receive a
 * working module. None of it is visible from the definition, and all of it
 * fails quietly: a missing `heryjs.module` makes the package invisible to the
 * loader, a `main` at a `.ts` file loads nowhere but in its own repository
 * (the CLI runs under ts-node, which ignores `node_modules`), and a `files`
 * that leaves out `src/runtime` publishes a module with nothing to copy.
 */
function manifestProblems(packageDir: string): string[] {
  const manifestPath = path.join(packageDir, 'package.json');

  if (!existsSync(manifestPath)) {
    return ['it has no package.json'];
  }

  let manifest: ModuleManifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ModuleManifest;
  } catch {
    return ['its package.json is not readable JSON'];
  }

  const problems: string[] = [];

  if (manifest.heryjs?.module !== true) {
    problems.push(
      'its package.json declares no "heryjs": { "module": true } — that marker is the whole community channel, and without it a project depending on this package sees no module at all',
    );
  }

  if (manifest.main === undefined) {
    problems.push('its package.json declares no main');
  } else if (!manifest.main.endsWith('.js')) {
    problems.push(
      `its main is ${manifest.main}, which is not compiled JavaScript — the CLI requires the entry under ts-node, and ts-node does not transpile node_modules`,
    );
  }

  if (manifest.files === undefined) {
    problems.push(
      'its package.json declares no files, so what reaches npm is whatever npm does not strip on its own',
    );

    return problems;
  }

  const shipped = ['src/runtime', path.dirname(manifest.main ?? 'dist/x')];

  shipped.forEach((entry) => {
    if (!publishes(entry, manifest.files as string[])) {
      problems.push(`its files does not publish ${entry}`);
    }
  });

  return problems;
}

export function validateModule(module: LoadedModule): string[] {
  const problems: string[] = manifestProblems(module.packageDir);
  const entry = path.join(module.packageDir, 'src', 'module.ts');
  const runtimeDir = path.join(module.packageDir, 'src', 'runtime');

  if (existsSync(entry)) {
    const touchesTheFilesystem = specifiersIn(entry).some(
      (specifier) => specifier === 'fs' || specifier.startsWith('node:fs'),
    );

    if (touchesTheFilesystem) {
      problems.push(
        'its src/module.ts imports node:fs — every write goes through the install context, which is what makes idempotence and the record of what was touched hold for every module',
      );
    }
  }

  if (!existsSync(runtimeDir) || !statSync(runtimeDir).isDirectory()) {
    problems.push(
      'it has no src/runtime — a module ships real files, never runtime code held in string constants',
    );

    return problems;
  }

  problems.push(...runtimeProblems(runtimeDir, module.packageDir));

  const usesKernel = filesUnder(runtimeDir)
    .filter((file) => file.endsWith('.ts'))
    .some((file) =>
      specifiersIn(file).some((specifier) => specifier.startsWith('#kernel/')),
    );
  const tsconfig = path.join(module.packageDir, 'tsconfig.json');

  /**
   * Only when the file is there. A published module ships its compiled entry
   * and `src/runtime` as sources -- its tsconfig stays in the author's
   * repository, so demanding one here failed every correctly published package
   * the moment it was validated from the project that depends on it, which is
   * where this command is meant to be run.
   */
  if (existsSync(tsconfig)) {
    const declared = readFileSync(tsconfig, 'utf8');

    if (usesKernel && !declared.includes('#kernel/*')) {
      problems.push(
        'its runtime imports #kernel/ but its tsconfig.json maps no #kernel/* path, so nothing here typechecks against the kernel',
      );
    }

    /**
     * A module that keeps integration tests outside `src/runtime` -- because
     * they exercise it against a running kernel rather than being copied into
     * the installing project -- has to say so in its own tsconfig. Left out,
     * the directory is outside the project, and every typed lint rule reports
     * every file in it as "not found by the project service", which names
     * neither the tsconfig nor the missing entry.
     */
    if (
      existsSync(path.join(module.packageDir, 'test')) &&
      !includes('test', declared)
    ) {
      problems.push(
        'it ships a test/ directory its tsconfig.json does not include, so neither its typecheck nor its typed lint rules can see it',
      );
    }
  }

  return problems;
}

/**
 * Every folder under `packages/` holding a `src/module.ts` that the loader did
 * not hand back. The loader already says why on its own output; this is what
 * turns that into a failure, since a module present but unusable is otherwise
 * only a line scrolling past.
 */
export function unloadablePackages(
  packagesDir: string,
  loaded: LoadedModule[],
): string[] {
  if (!existsSync(packagesDir)) {
    return [];
  }

  const loadedDirs = new Set(loaded.map((module) => module.packageDir));

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter(
      (dir) =>
        existsSync(path.join(dir, 'src', 'module.ts')) && !loadedDirs.has(dir),
    )
    .map((dir) => path.relative(path.dirname(packagesDir), dir));
}
