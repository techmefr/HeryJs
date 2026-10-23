import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { intersects, validRange } from 'semver';
import { loadOfficialModules } from '../cli/lib/module-discovery';
import { runtimeImports } from '../cli/lib/runtime-imports';

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_RANGE = /^workspace:/;

interface PackageManifest {
  main?: string;
  types?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readManifest(file: string): PackageManifest {
  return JSON.parse(readFileSync(file, 'utf8')) as PackageManifest;
}

function isTestOnly(file: string): boolean {
  return (
    /\.(spec|integration-spec|e2e-spec|fakes|factory)\.ts$/.test(file) ||
    file.endsWith('.d.ts')
  );
}

function shippedSources(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  if (
    existsSync(path.join(dir, 'package.json')) &&
    path.basename(dir) === 'runtime'
  ) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : shippedSources(full);
    }

    return entry.name.endsWith('.ts') && !isTestOnly(full) ? [full] : [];
  });
}

/**
 * The packages a module's shipped code loads, types included: a peer the type
 * checker needs is a peer the installing project has to provide. A runtime that
 * carries its own manifest is its own workspace and answers to that manifest.
 */
export function requiredPeers(packageDir: string): string[] {
  const names = new Set(
    shippedSources(path.join(packageDir, 'src')).flatMap((file) =>
      runtimeImports(readFileSync(file, 'utf8'), true),
    ),
  );

  return [...names].sort();
}

function exportsProblems(name: string, manifest: PackageManifest): string[] {
  const root = manifest.exports?.['.'] as
    { types?: string; default?: string } | undefined;
  const problems: string[] = [];

  if (root?.default !== `./${manifest.main}`) {
    problems.push(
      `${name} exports "." as ${JSON.stringify(root?.default)}, not its main ./${manifest.main}`,
    );
  }

  if (root?.types !== `./${manifest.types}`) {
    problems.push(
      `${name} exports "." types as ${JSON.stringify(root?.types)}, not ./${manifest.types}`,
    );
  }

  if (manifest.exports?.['./package.json'] !== './package.json') {
    problems.push(
      `${name} does not export ./package.json, which the CLI resolves to find the module`,
    );
  }

  return problems;
}

function installedRange(
  peer: string,
  manifest: PackageManifest,
  root: PackageManifest,
): string | undefined {
  return (
    manifest.devDependencies?.[peer] ??
    root.dependencies?.[peer] ??
    root.devDependencies?.[peer]
  );
}

/**
 * Each module package declares an `exports` map matching its entry, and
 * exactly the peers its shipped code imports, at a range the repository
 * itself satisfies. A peer the code stopped using, or one it started using
 * without declaring, is drift the published package would carry silently.
 */
export function checkPackageManifests(): boolean {
  const root = readManifest(path.join(REPO_ROOT, 'package.json'));
  const problems: string[] = [];
  const modules = loadOfficialModules();

  for (const module of modules) {
    const name = path.relative(REPO_ROOT, module.packageDir);
    const manifest = readManifest(path.join(module.packageDir, 'package.json'));
    const declared = manifest.peerDependencies ?? {};
    const required = requiredPeers(module.packageDir);

    problems.push(...exportsProblems(name, manifest));

    required
      .filter((peer) => declared[peer] === undefined)
      .forEach((peer) =>
        problems.push(
          `${name} imports ${peer} but declares no peerDependency on it`,
        ),
      );

    Object.keys(declared)
      .filter((peer) => !required.includes(peer))
      .forEach((peer) =>
        problems.push(
          `${name} declares a peerDependency on ${peer}, which nothing it ships imports`,
        ),
      );

    Object.entries(declared)
      .filter(([peer]) => required.includes(peer))
      .forEach(([peer, range]) => {
        if (WORKSPACE_RANGE.test(range)) {
          return;
        }

        const installed = installedRange(peer, manifest, root);

        if (validRange(range) === null) {
          problems.push(
            `${name} declares ${peer}@${range}, which is not a semver range`,
          );
        } else if (installed === undefined) {
          problems.push(
            `${name} declares ${peer} as a peer, but nothing in this repository installs it`,
          );
        } else if (
          !WORKSPACE_RANGE.test(installed) &&
          !intersects(range, installed)
        ) {
          problems.push(
            `${name} declares ${peer}@${range}, which the ${installed} this repository installs does not satisfy`,
          );
        }
      });
  }

  if (problems.length > 0) {
    problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));

    return false;
  }

  console.log(
    pc.green(
      `✔ ${modules.length} module packages declare their exports and exactly the peers they import`,
    ),
  );

  return true;
}
