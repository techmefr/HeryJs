import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import * as path from 'node:path';
import pc from 'picocolors';
import { loadOfficialModules } from '../cli/lib/module-discovery';

const root = path.resolve(__dirname, '..');

const STATIC_IMPORT =
  /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?'([^']+)';/gm;
const DYNAMIC_IMPORT = /\b(?:import|require)\(\s*'([^']+)'\s*\)/g;

const BUILTINS = new Set(builtinModules);

/**
 * Files that never reach a production build: specs, factories, the fakes and test support
 * they import, and declaration files.
 */
function isTestOnly(file: string): boolean {
  return (
    /\.(spec|fakes|factory|e2e-spec)\.ts$/.test(file) ||
    file.endsWith('.d.ts') ||
    file.includes(`${path.sep}testing${path.sep}`)
  );
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(full);
    }

    return entry.name.endsWith('.ts') && !isTestOnly(full) ? [full] : [];
  });
}

export function packageNameOf(specifier: string): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('#') ||
    specifier.startsWith('node:') ||
    BUILTINS.has(specifier.split('/')[0] ?? '')
  ) {
    return undefined;
  }

  const parts = specifier.split('/');

  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Every package a file loads at runtime: type-only imports are erased. */
export function runtimeImports(source: string): string[] {
  const names = new Set<string>();

  for (const match of source.matchAll(STATIC_IMPORT)) {
    const specifier = match[3];

    if (match[2] === undefined && specifier !== undefined) {
      const name = packageNameOf(specifier);

      if (name !== undefined) {
        names.add(name);
      }
    }
  }

  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const name = match[1] === undefined ? undefined : packageNameOf(match[1]);

    if (name !== undefined) {
      names.add(name);
    }
  }

  return [...names];
}

function bareName(spec: string): string {
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);

  return at === -1 ? spec : spec.slice(0, at);
}

/**
 * A runtime that lands as its own workspace member carries its own manifest,
 * and that manifest is the one its imports answer to.
 */
function workspaceDependencies(file: string): Set<string> {
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
}

/**
 * pnpm only links what a manifest declares, so a package that resolves here
 * because something else pulls it in is missing from a project's build: the
 * framework itself never noticed `express` was undeclared until a scaffolded
 * project ran `node dist/src/main`. Kernel code answers to the root
 * `dependencies`; a module's runtime answers to those plus what its own
 * definition installs, since `hery install` adds exactly that list.
 */
export function checkRuntimeDependencies(): boolean {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  const declared = new Set(Object.keys(manifest.dependencies ?? {}));

  const scopes: Array<{ files: string[]; allowed: Set<string> }> = [
    { files: sourceFiles(path.join(root, 'src')), allowed: declared },
    ...loadOfficialModules().map((module) => {
      const runtime = path.join(module.packageDir, 'src', 'runtime');

      return {
        files: sourceFiles(runtime),
        allowed: existsSync(path.join(runtime, 'package.json'))
          ? workspaceDependencies(path.join(runtime, 'package.json'))
          : new Set([
              ...declared,
              ...(module.dependencies ?? []).map(bareName),
            ]),
      };
    }),
  ];

  const problems = scopes.flatMap(({ files, allowed }) =>
    files.flatMap((file) =>
      runtimeImports(readFileSync(file, 'utf8'))
        .filter((name) => !allowed.has(name))
        .map(
          (name) =>
            `${path.relative(root, file)} imports "${name}", which no dependencies list declares`,
        ),
    ),
  );

  problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));

  return problems.length === 0;
}
