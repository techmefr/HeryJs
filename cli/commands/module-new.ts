import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { loadModules } from '../lib/module-discovery';
import { scaffoldModule, scaffoldProblem } from '../lib/module-scaffold';
import { printNextSteps } from '../lib/next-steps';

export function registerModuleNewCommand(program: Command): void {
  program
    .command('module:new <name>')
    .description('Scaffold a new installable module under packages/')
    .action((name: string) => {
      const repoRoot = process.cwd();
      const packagesDir = path.join(repoRoot, 'packages');
      const problem = scaffoldProblem(
        name,
        packagesDir,
        loadModules(repoRoot).map((module) => module.name),
      );

      if (problem !== undefined) {
        console.log(pc.red(`✖ ${problem}`));
        process.exitCode = 1;
        return;
      }

      scaffoldModule(name, packagesDir, repoRoot).forEach((file) =>
        console.log(pc.green(`✔ wrote ${file}`)),
      );

      printNextSteps([
        `Say what it does in packages/${name}/src/module.ts — that line is what module:list prints`,
        `Write the module's real files in packages/${name}/src/runtime, importing the kernel as #kernel/... and never through a relative path out of the package`,
        'Run "pnpm install" so the new workspace is linked',
        `Run "pnpm hery install ${name}" to install it into this project, which is also what puts its spec where the test suite looks`,
        'Run "pnpm test" and "pnpm lint:module-drift"',
      ]);
    });
}
