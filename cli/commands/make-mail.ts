import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { mailableFile } from '../lib/makeable-templates';
import { kebabCase, kebabToPascalCase } from '../lib/naming';
import { printNextSteps } from '../lib/next-steps';

export interface MakeableFile {
  domain: string;
  fileName: string;
  source: string;
  pascalName: string;
}

export function buildMailable(name: string, domain?: string): MakeableFile {
  const kebabName = kebabCase(name);
  const pascalName = kebabToPascalCase(kebabName);

  return {
    domain: domain ? kebabCase(domain) : kebabName.replace(/-?mail$/, ''),
    fileName: `${kebabName}.ts`,
    source: mailableFile({ pascalName, kebabName }),
    pascalName,
  };
}

export function registerMakeMailCommand(program: Command): void {
  program
    .command('make:mail <name>')
    .description('Generate a Mailable under src/functional/<domain>')
    .option('-d, --domain <name>', 'Domain folder to write it into')
    .option('-f, --force', 'Overwrite an existing file')
    .action((name: string, options: { domain?: string; force?: boolean }) => {
      const mailable = buildMailable(name, options.domain);
      const targetDir = path.join(
        process.cwd(),
        'src',
        'functional',
        mailable.domain,
      );
      const targetPath = path.join(targetDir, mailable.fileName);

      if (existsSync(targetPath) && !options.force) {
        console.error(
          pc.red(`${targetPath} already exists. Pass --force to overwrite.`),
        );
        process.exitCode = 1;
        return;
      }

      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, mailable.source);
      console.log(pc.green(`✔ ${targetPath}`));

      printNextSteps([
        `Write the real subject and html in ${mailable.pascalName}.build()`,
        `Send it with MailService.send(new ${mailable.pascalName}(recipient)) — the mailable never picks a driver itself`,
        'Run "pnpm hery install mail" if the mail module is not installed yet',
      ]);
    });
}
