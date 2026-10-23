import type { Command } from 'commander';
import pc from 'picocolors';
import { migrateKernelImports } from '../lib/kernel-codemod';
import { KERNEL_PACKAGE } from '../lib/kernel-public-api';

export function registerKernelMigrateCommand(program: Command): void {
  program
    .command('kernel:migrate [paths...]')
    .description(
      `Rewrite #kernel/public/<entry> imports to ${KERNEL_PACKAGE}/<entry> and map ${KERNEL_PACKAGE}/* in each tsconfig, under packages/ unless paths are given. Safe to run again.`,
    )
    .option(
      '--peer <range>',
      `declare ${KERNEL_PACKAGE} at this range as a peer of every package whose shipped code imports it`,
    )
    .option(
      '--check',
      'list what would change, write nothing, exit 1 if anything would',
    )
    .action((paths: string[], options: { peer?: string; check?: boolean }) => {
      const changed = migrateKernelImports(
        process.cwd(),
        paths.length > 0 ? paths : ['packages'],
        { peerRange: options.peer, write: options.check !== true },
      );

      if (changed.length === 0) {
        console.log(
          pc.green(`✔ already on ${KERNEL_PACKAGE}, nothing to change`),
        );
        return;
      }

      changed.forEach((file) =>
        console.log(
          options.check === true
            ? pc.yellow(`✖ ${file}`)
            : pc.green(`✔ ${file}`),
        ),
      );

      if (options.check === true) {
        process.exitCode = 1;
      }
    });
}
