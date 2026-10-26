import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { LoadedModule } from '../lib/module-definition';
import { createInstallContext } from '../lib/module-context';
import { findModule, loadModules } from '../lib/module-discovery';
import { installableModules } from '../lib/module-compatibility';
import { modulePackageName, wireModule } from '../lib/hery-config-patch';
import { isInstalledPackage, siblingPackageSpec } from '../lib/module-packages';

interface InstallOptions {
  all?: boolean;
  force?: boolean;
}

export function registerInstallCommand(program: Command): void {
  program
    .command('install [modules...]')
    .description(
      'Install one or more optional HeryJs modules (see hery module:list), or --all for the full package',
    )
    .option('--all', 'install every registered module')
    .option(
      '--force',
      'install even a module written for another version of HeryJs',
    )
    .action(async (moduleNames: string[], options: InstallOptions) => {
      const available = withMissingPackagesAdded(
        loadModules(),
        options.all ? [] : moduleNames,
      );
      const requested = options.all
        ? available
        : resolveModules(available, moduleNames);
      const targets = installableModules(requested, options.force === true);

      if (targets.length === 0) {
        console.log(pc.yellow('nothing to install'));
        return;
      }

      for (const module of targets) {
        console.log(pc.cyan(`installing ${module.name}...`));

        if (module.dependencies?.length) {
          execSync(`pnpm add -w ${module.dependencies.join(' ')}`, {
            stdio: 'inherit',
          });
        }

        await module.install(createInstallContext(module));

        for (const file of wireModule(process.cwd(), {
          name: modulePackageName(module.packageDir, module.name),
          moduleName: module.name,
          dest: module.dest,
          contractDir: isInstalledPackage(module.packageDir)
            ? path.join(module.packageDir, 'src', 'runtime')
            : undefined,
        })) {
          console.log(pc.green(`✔ declared ${module.name} in ${file}`));
        }

        console.log(pc.green(`✔ ${module.name} installed`));
      }
    });
}

/**
 * A module a project does not depend on yet is added as `@heryjs/<name>`, from
 * where its `@heryjs/core` comes, so `hery install` finds it as installed.
 */
function withMissingPackagesAdded(
  available: LoadedModule[],
  names: string[],
): LoadedModule[] {
  const missing = names.filter((name) => !findModule(available, name));

  if (missing.length === 0) {
    return available;
  }

  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  const core = manifest.dependencies?.['@heryjs/core'];

  if (core === undefined) {
    return available;
  }

  const specs = missing.map((name) => {
    const spec = siblingPackageSpec(core, name);

    return spec.startsWith('file:') && !existsSync(spec.slice('file:'.length))
      ? undefined
      : `@heryjs/${name}@${spec}`;
  });
  const adding = specs.filter((spec): spec is string => spec !== undefined);

  if (adding.length === 0) {
    return available;
  }

  try {
    execSync(`pnpm add -w ${adding.join(' ')}`, { stdio: 'inherit' });
  } catch {
    return available;
  }

  return loadModules();
}

function resolveModules(
  available: LoadedModule[],
  names: string[],
): LoadedModule[] {
  const modules: LoadedModule[] = [];

  for (const name of names) {
    const module = findModule(available, name);

    if (!module) {
      console.log(
        pc.red(
          `✖ no module named "${name}", run "hery module:list" to see what is available`,
        ),
      );
      process.exitCode = 1;
      continue;
    }

    modules.push(module);
  }

  return modules;
}
