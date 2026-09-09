import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { InstallContext, ModuleDefinition } from './module-definition';
import { loadOfficialModules } from './module-discovery';
import { publishes } from './module-validation';

const MODULES = loadOfficialModules();

/**
 * Every file an install copies straight out of the package root -- a compose
 * file, in practice. Read by running the definition against a context that
 * writes nothing, because which files those are is a decision inside
 * `install()` and not something the manifest states.
 */
async function copiedFromPackageRoot(
  install: ModuleDefinition['install'],
): Promise<string[]> {
  const copied: string[] = [];

  const context = {
    touched: [],
    copyRuntime: () => undefined,
    copyPackageFile: (name: string) => copied.push(name),
    addPrismaModels: () => undefined,
    addModelFields: () => undefined,
    chainScript: () => undefined,
    addWorkspace: () => undefined,
    patchExactStrings: () => undefined,
    nextSteps: () => undefined,
  } as unknown as InstallContext;

  await install(context);

  return copied;
}

/**
 * A file the install copies and `files` does not publish is a file missing
 * from every project that installs the module off npm -- and missing quietly,
 * the way `examples/*.yaml` went missing from the framework's own tarball.
 * The four search and infrastructure modules each carry a compose file this
 * way, and nothing in the manifest says so.
 */
describe('what a module has to publish', () => {
  it('found the modules to check', () => {
    expect(MODULES).toHaveLength(11);
  });

  it.each(MODULES.map((module) => [module.name, module] as const))(
    '%s publishes every file its install copies',
    async (_name, module) => {
      const manifest = JSON.parse(
        readFileSync(path.join(module.packageDir, 'package.json'), 'utf8'),
      ) as { files: string[] };

      const copied = await copiedFromPackageRoot((context) =>
        module.install(context),
      );

      copied.forEach((file) => {
        expect(existsSync(path.join(module.packageDir, file))).toBe(true);
        expect(publishes(file, manifest.files)).toBe(true);
      });
    },
  );
});
