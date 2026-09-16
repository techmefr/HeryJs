import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { exportableFile } from '../lib/makeable-templates';
import { kebabCase, kebabToPascalCase } from '../lib/naming';
import { printNextSteps } from '../lib/next-steps';

export interface MakeableFile {
  domain: string;
  fileName: string;
  source: string;
  pascalName: string;
}

export function buildExportable(name: string, domain?: string): MakeableFile {
  const kebabName = kebabCase(name);
  const pascalName = kebabToPascalCase(kebabName);

  return {
    domain: domain ? kebabCase(domain) : kebabName.replace(/-?export$/, ''),
    fileName: `${kebabName}.ts`,
    source: exportableFile({ pascalName, kebabName }),
    pascalName,
  };
}

export function registerMakeExportCommand(program: Command): void {
  program
    .command('make:export <name>')
    .description('Generate an Exportable under src/functional/<domain>')
    .option('-d, --domain <name>', 'Domain folder to write it into')
    .option('-f, --force', 'Overwrite an existing file')
    .action((name: string, options: { domain?: string; force?: boolean }) => {
      const exportable = buildExportable(name, options.domain);
      const targetDir = path.join(
        process.cwd(),
        'src',
        'functional',
        exportable.domain,
      );
      const targetPath = path.join(targetDir, exportable.fileName);

      if (existsSync(targetPath) && !options.force) {
        console.error(
          pc.red(`${targetPath} already exists. Pass --force to overwrite.`),
        );
        process.exitCode = 1;
        return;
      }

      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, exportable.source);
      console.log(pc.green(`✔ ${targetPath}`));

      printNextSteps([
        `List the real columns and return the real rows in ${exportable.pascalName}`,
        `Render it with ExportService.as(format).generate(new ${exportable.pascalName}()) — the format is chosen per call, never by the exportable`,
        'Run "pnpm hery install export" if the export module is not installed yet',
      ]);
    });
}
