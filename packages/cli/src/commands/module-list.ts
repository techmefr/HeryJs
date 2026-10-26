import type { Command } from 'commander';
import pc from 'picocolors';
import { loadModules } from '../lib/module-discovery';

export function registerModuleListCommand(program: Command): void {
  program
    .command('module:list')
    .description('List the optional modules available for hery install')
    .action(() => {
      const modules = loadModules();

      if (modules.length === 0) {
        console.log(pc.yellow('no optional modules registered yet'));
        return;
      }

      for (const module of modules) {
        console.log(
          `${pc.bold(module.name)} ${pc.dim(`[${module.channel}]`)} - ${module.description}`,
        );
      }
    });
}
