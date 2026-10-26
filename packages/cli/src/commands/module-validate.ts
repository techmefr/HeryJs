import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { findModule, loadModules } from '../lib/module-discovery';
import { unloadablePackages, validateModule } from '../lib/module-validation';

export function registerModuleValidateCommand(program: Command): void {
  program
    .command('module:validate [name]')
    .description(
      'Check a module against the authoring contract, or every module when given no name',
    )
    .action((name: string | undefined) => {
      const projectRoot = process.cwd();
      const available = loadModules(projectRoot);

      if (name !== undefined) {
        const module = findModule(available, name);

        if (!module) {
          console.log(
            pc.red(
              `✖ no module named "${name}", run "hery module:list" to see what is loadable`,
            ),
          );
          process.exitCode = 1;
          return;
        }

        report([module].map((one) => [one.name, validateModule(one)]));
        return;
      }

      const unloadable = unloadablePackages(
        path.join(projectRoot, 'packages'),
        available,
      );

      unloadable.forEach((dir) =>
        console.log(pc.red(`✖ ${dir} holds a module the loader cannot use`)),
      );

      if (unloadable.length > 0) {
        process.exitCode = 1;
      }

      report(available.map((module) => [module.name, validateModule(module)]));
    });
}

function report(results: Array<[string, string[]]>): void {
  for (const [name, problems] of results) {
    if (problems.length === 0) {
      console.log(pc.green(`✔ ${name}`));
      continue;
    }

    console.log(pc.red(`✖ ${name}`));
    problems.forEach((problem) => console.log(pc.red(`    ${problem}`)));
    process.exitCode = 1;
  }
}
