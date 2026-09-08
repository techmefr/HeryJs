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
export function validateModule(module: LoadedModule): string[] {
  const problems: string[] = [];
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

  if (
    usesKernel &&
    (!existsSync(tsconfig) ||
      !readFileSync(tsconfig, 'utf8').includes('#kernel/*'))
  ) {
    problems.push(
      'its runtime imports #kernel/ but its tsconfig.json maps no #kernel/* path, so nothing here typechecks against the kernel',
    );
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
