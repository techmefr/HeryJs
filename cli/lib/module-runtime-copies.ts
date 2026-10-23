import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { CLI_PACKAGE, KERNEL_PACKAGE } from './kernel-public-api';
import { copyRuntime } from './runtime-copy';

/**
 * This repository runs each module from its workspace package, which a
 * project does not have yet: until the modules are published, a project still
 * carries their runtime under src/modules and lists their contracts in
 * src/hery.modules.ts.
 */
export const COPIED_MODULES_DIR = path.join('src', 'modules');

const COPIED_IMPORT = {
  types: './src/modules/*.ts',
  development: './src/modules/*.ts',
  default: './dist/src/modules/*.js',
};

const MODULE_PACKAGE = /^@heryjs\/(?!core$|cli$)([^/]+)$/;

/** The module packages a manifest takes from the workspace. */
export function workspaceModules(
  dependencies: Record<string, string> = {},
): string[] {
  return Object.entries(dependencies)
    .filter(
      ([name, range]) =>
        range.startsWith('workspace:') &&
        name !== KERNEL_PACKAGE &&
        name !== CLI_PACKAGE &&
        MODULE_PACKAGE.test(name),
    )
    .map(([name]) => MODULE_PACKAGE.exec(name)![1]!)
    .sort();
}

/**
 * Points every `#modules/` mapper at the copied runtime instead of the
 * workspace packages, and drops the mappers for the packages themselves.
 */
export function withCopiedModuleMapper(
  mapper: Record<string, string>,
): Record<string, string> {
  const functional = mapper['^#functional/(.*)$'];
  const target = functional?.replace(/functional\/\$1$/, 'modules/$1');

  return Object.fromEntries(
    Object.entries(mapper).flatMap(([pattern, value]): [string, string][] => {
      if (pattern.startsWith('^@heryjs/(?!core/|cli/)')) {
        return [];
      }

      if (pattern.startsWith('^#modules/')) {
        return target ? [['^#modules/(.*)$', target]] : [];
      }

      return [[pattern, value]];
    }),
  );
}

interface ProjectManifest {
  dependencies?: Record<string, string>;
  imports?: Record<string, unknown>;
  jest?: { moduleNameMapper?: Record<string, string> };
}

/** A project's manifest, reading its modules from the copied runtime. */
export function withCopiedModuleRuntimes<T extends ProjectManifest>(
  manifest: T,
): T {
  const copy = structuredClone(manifest);
  const modules = new Set(
    workspaceModules(copy.dependencies).map((name) => `@heryjs/${name}`),
  );

  if (copy.dependencies) {
    copy.dependencies = Object.fromEntries(
      Object.entries(copy.dependencies).filter(([name]) => !modules.has(name)),
    );
  }

  if (copy.imports?.['#modules/*'] !== undefined) {
    copy.imports = { ...copy.imports, '#modules/*': COPIED_IMPORT };
  }

  if (copy.jest?.moduleNameMapper) {
    copy.jest.moduleNameMapper = withCopiedModuleMapper(
      copy.jest.moduleNameMapper,
    );
  }

  return copy;
}

/** Copies the runtime of each module into the project, beside its specs. */
export function copyModuleRuntimes(
  frameworkRoot: string,
  destRoot: string,
  modules: readonly string[],
): void {
  for (const name of modules) {
    const runtime = path.join(
      frameworkRoot,
      'packages',
      name,
      'src',
      'runtime',
    );

    if (existsSync(runtime)) {
      copyRuntime(runtime, path.join(destRoot, COPIED_MODULES_DIR, name), {
        quiet: true,
      });
    }
  }
}

/** AppModule handing HeryModule the contracts src/hery.modules.ts lists. */
export function withListedHeryModules(source: string): string {
  if (source.includes('heryModules')) {
    return source;
  }

  return source
    .replace(
      'HeryModule.forRoot(heryConfig)',
      'HeryModule.forRoot(heryConfig, heryModules)',
    )
    .replace(
      "import { AppService } from './app.service';\n",
      "import { AppService } from './app.service';\nimport { heryModules } from './hery.modules';\n",
    );
}
