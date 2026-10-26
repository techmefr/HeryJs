import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { KERNEL_PACKAGE } from '../packages/cli/src/lib/kernel-public-api';
import { loadOfficialModules } from '../packages/cli/src/lib/module-discovery';
import {
  bareName,
  runtimeImports,
} from '../packages/cli/src/lib/runtime-imports';

const root = path.resolve(__dirname, '..');

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
 * What the kernel loads only outside production, as its optional peers: a
 * project installs them as dev dependencies, which its image prunes.
 */
function optionalKernelPeers(): string[] {
  const kernel = JSON.parse(
    readFileSync(path.join(root, 'packages', 'core', 'package.json'), 'utf8'),
  ) as { peerDependenciesMeta?: Record<string, { optional?: boolean }> };

  return Object.entries(kernel.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta.optional === true)
    .map(([name]) => name);
}

/**
 * pnpm only links what a manifest declares, so a package that resolves here
 * because something else pulls it in is missing from a project's build: the
 * framework itself never noticed `express` was undeclared until a scaffolded
 * project ran `node dist/src/main`. Kernel code answers to the root
 * `dependencies`; a module's runtime answers to those plus what its own
 * definition installs, since `hery install` adds exactly that list. The one
 * exception is @heryjs/core: the copy lands as the project's own #technical/,
 * so the kernel the module imports is the one the project already has.
 */
export function checkRuntimeDependencies(): boolean {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...optionalKernelPeers().filter(
      (name) => manifest.devDependencies?.[name] !== undefined,
    ),
  ]);

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
              KERNEL_PACKAGE,
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
