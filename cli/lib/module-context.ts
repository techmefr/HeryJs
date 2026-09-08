import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import type { InstallContext, LoadedModule } from './module-definition';
import { patchExactStrings, patchModelFields } from './schema-patch';
import { copyRuntime } from './runtime-copy';

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
        console.log(pc.yellow(`${name} already exists, skipping.`));
        return;
      }

      writeFileSync(
        name,
        readFileSync(path.join(module.packageDir, name), 'utf8'),
      );
      wrote(name);
    },

    patch(file, marker, edit): void {
      if (!existsSync(file)) {
        console.log(pc.yellow(`${file} does not exist here, skipping.`));
        return;
      }

      const source = readFileSync(file, 'utf8');

      if (source.includes(marker)) {
        console.log(pc.yellow(`${file} already has ${marker}, skipping.`));
        return;
      }

      const next = edit(source);

      if (next === undefined || next === source) {
        console.log(pc.yellow(`${file} has nothing to patch, skipping.`));
        return;
      }

      writeFileSync(file, next);
      patched(file);
    },

    patchModelFields(file, model, fields): void {
      if (patchModelFields(file, model, fields)) {
        patched(file);
        return;
      }

      console.log(pc.yellow(`${file} already has ${model} patched, skipping.`));
    },

    patchExactStrings(file, pairs, guard): void {
      if (patchExactStrings(file, pairs, guard)) {
        patched(file);
        return;
      }

      // The guard is a code fragment and routinely spans lines, so it is not
      // repeated back here the way a short marker is.
      console.log(pc.yellow(`${file} is already patched, skipping.`));
    },

    nextSteps(steps): void {
      console.log('');
      console.log(pc.cyan('Next steps:'));
      steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step}`);
      });
    },
  };
}
