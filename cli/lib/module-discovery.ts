import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const OFFICIAL_PACKAGES_DIR = path.join(__dirname, '../../packages');

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  heryjs?: { module?: boolean };
}

function readPackageJson(pkgJsonPath: string): PackageJson | undefined {
  try {
    return JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as PackageJson;
  } catch {
    return undefined;
  }
}

/**
 * The official channel used to be a hand-maintained barrel file, one import
 * line per package -- every new module in `packages/` meant remembering to
 * add it there too. Every folder under `packages/` that ships a
 * `src/module.ts` is the module; requiring it is what runs its own
 * `registerModule()` call, so this just walks the directory instead of
 * repeating what the filesystem already knows.
 */
export function loadOfficialModules(): void {
  if (!existsSync(OFFICIAL_PACKAGES_DIR)) {
    return;
  }

  for (const entry of readdirSync(OFFICIAL_PACKAGES_DIR, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const modulePath = path.join(
      OFFICIAL_PACKAGES_DIR,
      entry.name,
      'src',
      'module',
    );

    if (existsSync(`${modulePath}.ts`)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(modulePath);
    }
  }
}

/**
 * The community channel is any real npm package a project has installed
 * that opts into the same convention: a `heryjs.module: true` marker in its
 * own `package.json`. Nothing here is specific to any one package -- this
 * is the discovery mechanism a third-party module author targets, not a
 * list HeryJs curates. A dependency that fails to resolve (private registry
 * hiccup, package removed from disk) is skipped rather than aborting the
 * whole scan; one broken dependency should not hide every other module.
 */
export function loadCommunityModules(projectRoot: string): void {
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  const pkg = readPackageJson(pkgJsonPath);

  if (!pkg) {
    return;
  }

  const names = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  });

  for (const name of names) {
    try {
      const depPkgJsonPath = require.resolve(`${name}/package.json`, {
        paths: [projectRoot],
      });
      const depPkg = readPackageJson(depPkgJsonPath);

      if (!depPkg?.heryjs?.module) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(require.resolve(name, { paths: [projectRoot] }));
    } catch {
      continue;
    }
  }
}

export function loadModules(projectRoot: string = process.cwd()): void {
  loadOfficialModules();
  loadCommunityModules(projectRoot);
}
