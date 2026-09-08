import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { LoadedModule } from '../lib/module-definition';
import { createInstallContext } from '../lib/module-context';
import { findModule, loadModules } from '../lib/module-discovery';

export function registerInstallCommand(program: Command): void {
  program
    .command('install [modules...]')
    .description(
      'Install one or more optional HeryJs modules (see hery module:list), or --all for the full package',
    )
    .option('--all', 'install every registered module')
    .action(async (moduleNames: string[], options: { all?: boolean }) => {
      const available = loadModules();
      const targets = options.all
        ? available
        : resolveModules(available, moduleNames);

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
        console.log(pc.green(`✔ ${module.name} installed`));
      }
    });
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
