import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { parseDriverContract, renderDriver } from '../lib/driver-contract';
import type { DriverFiles } from '../lib/driver-contract';
import { kebabCase, kebabToPascalCase } from '../lib/naming';
import { printNextSteps } from '../lib/next-steps';

export type DriverBuild =
  | { isBuilt: true; files: DriverFiles; moduleKebab: string }
  | { isBuilt: false; reason: string };

export function buildDriver(
  moduleName: string,
  name: string,
  contractSource: string,
): DriverBuild {
  const moduleKebab = kebabCase(moduleName);
  const contract = parseDriverContract(contractSource, moduleKebab);

  if (!contract) {
    return {
      isBuilt: false,
      reason: `No exported *Driver interface found in src/technical/${moduleKebab}/${moduleKebab}-driver.ts`,
    };
  }

  const driverKebab = kebabCase(name).replace(/-?driver$/, '');

  return {
    isBuilt: true,
    moduleKebab,
    files: renderDriver(
      contract,
      moduleKebab,
      kebabToPascalCase(driverKebab),
      driverKebab,
      kebabToPascalCase(moduleKebab),
    ),
  };
}

export function registerMakeDriverCommand(program: Command): void {
  program
    .command('make:driver <module> <name>')
    .description(
      'Generate a driver for a module, implementing the contract in src/technical/<module>',
    )
    .option('-f, --force', 'Overwrite existing files')
    .action(
      (moduleName: string, name: string, options: { force?: boolean }) => {
        const root = process.cwd();
        const moduleKebab = kebabCase(moduleName);
        const contractPath = path.join(
          root,
          'src',
          'technical',
          moduleKebab,
          `${moduleKebab}-driver.ts`,
        );

        if (!existsSync(contractPath)) {
          console.error(
            pc.red(
              `${contractPath} does not exist. Is "${moduleName}" a module with drivers?`,
            ),
          );
          process.exitCode = 1;
          return;
        }

        const built = buildDriver(
          moduleName,
          name,
          readFileSync(contractPath, 'utf8'),
        );

        if (!built.isBuilt) {
          console.error(pc.red(built.reason));
          process.exitCode = 1;
          return;
        }

        const targetDir = path.join(root, 'src', 'modules', built.moduleKebab);
        const targets = [
          {
            file: built.files.driverFileName,
            source: built.files.driverSource,
          },
          {
            file: built.files.moduleFileName,
            source: built.files.moduleSource,
          },
        ];
        const existing = targets.filter(
          (target) =>
            existsSync(path.join(targetDir, target.file)) && !options.force,
        );

        if (existing.length > 0) {
          console.error(
            pc.red(
              `${existing.map((target) => target.file).join(', ')} already exists. Pass --force to overwrite.`,
            ),
          );
          process.exitCode = 1;
          return;
        }

        mkdirSync(targetDir, { recursive: true });

        for (const target of targets) {
          const targetPath = path.join(targetDir, target.file);
          writeFileSync(targetPath, target.source);
          console.log(pc.green(`✔ ${targetPath}`));
        }

        printNextSteps([
          `Implement ${built.files.className}`,
          `Import ${built.files.moduleClassName} into src/app.module.ts`,
          `Declare the driver in hery.config.ts under ${moduleKebab}.drivers, then select it as the default`,
        ]);
      },
    );
}
