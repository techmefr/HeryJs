import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { getModule, listModules } from '../lib/module-registry';
import type { ModuleDefinition } from '../lib/module-registry';
import '../modules';

export function registerInstallCommand(program: Command): void {
  program
    .command('install [modules...]')
    .description(
      'Install one or more optional HeryJs modules (see hery module:list), or --all for the full package',
    )
    .option('--all', 'install every registered module')
    .action(async (moduleNames: string[], options: { all?: boolean }) => {
      const targets = options.all ? listModules() : resolveModules(moduleNames);

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

        await module.install();
        console.log(pc.green(`✔ ${module.name} installed`));
      }
    });
}

function resolveModules(names: string[]): ModuleDefinition[] {
  const modules: ModuleDefinition[] = [];

  for (const name of names) {
    const module = getModule(name);

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
