import type { Command } from 'commander';
import pc from 'picocolors';
import { listModules } from '../lib/module-registry';
import '../modules';

export function registerModuleListCommand(program: Command): void {
  program
    .command('module:list')
    .description('List the optional modules available for hery install')
    .action(() => {
      const modules = listModules();

      if (modules.length === 0) {
        console.log(pc.yellow('no optional modules registered yet'));
        return;
      }

      for (const module of modules) {
        console.log(`${pc.bold(module.name)} - ${module.description}`);
      }
    });
}
