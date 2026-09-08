import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import type { InstallContext, LoadedModule } from './module-definition';
import {
  PRISMA_SCHEMA,
  addModelFields,
  addPrismaModels,
  modelNamesIn,
  patchExactStrings,
} from './schema-patch';
import {
  PACKAGE_MANIFEST,
  WORKSPACE_MANIFEST,
  addWorkspace,
  chainScript,
} from './project-patch';
import { copyRuntime } from './runtime-copy';
import { printNextSteps } from './next-steps';

/**
 * Builds the one object an `install()` receives. Every method here either
 * writes and says so, or skips and says why -- there is no third outcome, and
 * no module can produce one, because none of them import `node:fs`.
 */
export function createInstallContext(module: LoadedModule): InstallContext {
  const touched: string[] = [];

  function wrote(file: string): void {
    touched.push(file);
    console.log(pc.green(`✔ ${file}`));
  }

  function patched(file: string): void {
    touched.push(file);
    console.log(pc.green(`✔ patched ${file}`));
  }

  function skipped(file: string, reason: string): void {
    console.log(pc.yellow(`${file} ${reason}, skipping.`));
  }

  return {
    touched,

    copyRuntime(): void {
      const runtimeDir = path.join(module.packageDir, 'src', 'runtime');

      for (const file of copyRuntime(runtimeDir, module.dest)) {
        touched.push(file);
      }
    },

    copyPackageFile(name: string): void {
      if (existsSync(name)) {
        skipped(name, 'already exists');
        return;
      }

      writeFileSync(
        name,
        readFileSync(path.join(module.packageDir, name), 'utf8'),
      );
      wrote(name);
    },

    addPrismaModels(models): void {
      if (!existsSync(PRISMA_SCHEMA)) {
        skipped(PRISMA_SCHEMA, 'does not exist here');
        return;
      }

      if (addPrismaModels(PRISMA_SCHEMA, models)) {
        patched(PRISMA_SCHEMA);
        return;
      }

      skipped(PRISMA_SCHEMA, `already declares ${modelNamesIn(models)[0]}`);
    },

    addModelFields(model, fields): void {
      if (!existsSync(PRISMA_SCHEMA)) {
        skipped(PRISMA_SCHEMA, 'does not exist here');
        return;
      }

      if (addModelFields(PRISMA_SCHEMA, model, fields)) {
        patched(PRISMA_SCHEMA);
        return;
      }

      skipped(PRISMA_SCHEMA, `already has ${model} patched`);
    },

    chainScript(script, command): void {
      if (!existsSync(PACKAGE_MANIFEST)) {
        skipped(PACKAGE_MANIFEST, 'does not exist here');
        return;
      }

      const outcome = chainScript(PACKAGE_MANIFEST, script, command);

      if (outcome === 'chained') {
        patched(PACKAGE_MANIFEST);
        return;
      }

      skipped(
        PACKAGE_MANIFEST,
        outcome === 'already chained'
          ? `already runs "${command}" in "${script}"`
          : `has no "${script}" script to chain onto`,
      );
    },

    addWorkspace(directory): void {
      if (!existsSync(WORKSPACE_MANIFEST)) {
        skipped(WORKSPACE_MANIFEST, 'does not exist here');
        return;
      }

      if (addWorkspace(WORKSPACE_MANIFEST, directory)) {
        patched(WORKSPACE_MANIFEST);
        return;
      }

      skipped(WORKSPACE_MANIFEST, `already lists ${directory}`);
    },

    patchExactStrings(file, pairs, guard): void {
      if (!existsSync(file)) {
        skipped(file, 'does not exist here');
        return;
      }

      if (patchExactStrings(file, pairs, guard)) {
        patched(file);
        return;
      }

      // The guard is a code fragment and routinely spans lines, so it is not
      // repeated back here the way a short marker is.
      skipped(file, 'is already patched');
    },

    nextSteps(steps): void {
      printNextSteps(steps);
    },
  };
}
