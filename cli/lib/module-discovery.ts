import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import type {
  LoadedModule,
  ModuleChannel,
  ModuleDefinition,
} from './module-definition';
import { defaultDest, definitionProblems } from './module-definition';

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
 * A module is the default export of its entry point. Requiring it used to be
 * enough on its own, because the entry called `registerModule()` as a side
 * effect -- which is exactly what a third-party package could not do, having
 * nothing to import that function from. Reading the export instead means the
 * author needs no runtime dependency on HeryJs at all.
 */
export function readDefinition(
  entry: string,
  channel: ModuleChannel,
  packageDir: string,
  source: string,
): LoadedModule | undefined {
  let exported: unknown;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require(entry) as { default?: unknown };
    exported = required.default ?? required;
  } catch (error) {
    console.log(
      pc.red(
        `✖ ${source} could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return undefined;
  }

  const problems = definitionProblems(exported);

  if (problems.length > 0) {
    console.log(pc.red(`✖ ${source} is not a usable module:`));
    problems.forEach((problem) => console.log(pc.red(`    ${problem}`)));
    return undefined;
  }

  const definition = exported as ModuleDefinition;

  return {
    ...definition,
    dest: definition.dest ?? defaultDest(definition.name),
    channel,
    packageDir,
  };
}

/**
 * Every folder under `packages/` that ships a `src/module.ts` is a module, so
 * this walks the directory instead of repeating what the filesystem already
 * knows -- there is no barrel file to remember.
 */
export function loadOfficialModules(): LoadedModule[] {
  if (!existsSync(OFFICIAL_PACKAGES_DIR)) {
    return [];
  }

  const modules: LoadedModule[] = [];

  for (const entry of readdirSync(OFFICIAL_PACKAGES_DIR, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageDir = path.join(OFFICIAL_PACKAGES_DIR, entry.name);
    const modulePath = path.join(packageDir, 'src', 'module');

    if (!existsSync(`${modulePath}.ts`)) {
      continue;
    }

    const loaded = readDefinition(
      modulePath,
      'official',
      packageDir,
      `packages/${entry.name}`,
    );

    if (loaded) {
      modules.push(loaded);
    }
  }

  return modules;
}

/**
 * The community channel is any npm package a project has installed that opts
 * into the same convention: a `heryjs.module: true` marker in its own
 * `package.json`. There is no registry to submit to and nothing HeryJs curates
 * on that side -- the convention is the whole channel. A dependency that fails
 * to resolve is skipped rather than aborting the scan; one broken dependency
 * should not hide every other module. A dependency that resolves but exports
 * the wrong shape is reported, because a module that is present and unusable
 * is worth being loud about.
 */
export function loadCommunityModules(projectRoot: string): LoadedModule[] {
  const pkg = readPackageJson(path.join(projectRoot, 'package.json'));

  if (!pkg) {
    return [];
  }

  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const modules: LoadedModule[] = [];

  for (const name of names) {
    let entry: string;
    let packageDir: string;

    try {
      const depPkgJsonPath = require.resolve(`${name}/package.json`, {
        paths: [projectRoot],
      });

      if (!readPackageJson(depPkgJsonPath)?.heryjs?.module) {
        continue;
      }

      entry = require.resolve(name, { paths: [projectRoot] });
      packageDir = path.dirname(depPkgJsonPath);
    } catch {
      continue;
    }

    const loaded = readDefinition(entry, 'community', packageDir, name);

    if (loaded) {
      modules.push(loaded);
    }
  }

  return modules;
}

/**
 * Two modules answering to one name, which the official channel and the
 * community channel can now both hold: every official module is also
 * published as `@heryjs/<name>`, and a generated project already carries the
 * whole of `packages/`. Adding one from npm on top of that is a name resolving
 * to whichever the loader saw first -- which is the official copy, silently.
 * Reported rather than resolved, because which one the developer meant is not
 * something this can know.
 */
export function shadowedNames(modules: LoadedModule[]): string[] {
  const seen = new Set<string>();

  return modules
    .filter((module) => (seen.has(module.name) ? true : !seen.add(module.name)))
    .map((module) => module.name);
}

export function loadModules(
  projectRoot: string = process.cwd(),
): LoadedModule[] {
  const modules = [
    ...loadOfficialModules(),
    ...loadCommunityModules(projectRoot),
  ];

  shadowedNames(modules).forEach((name) => {
    const winner = modules.find((module) => module.name === name);

    console.log(
      pc.yellow(
        `! two modules are named "${name}" — the ${winner?.channel} one wins, and the other is unreachable by that name`,
      ),
    );
  });

  return modules;
}

export function findModule(
  modules: LoadedModule[],
  name: string,
): LoadedModule | undefined {
  return modules.find((module) => module.name === name);
}
