import { realpathSync } from 'node:fs';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  copiedConventionScripts,
  removeCopiedConventionScripts,
} from '../lib/convention-scripts';
import { frameworkRoot } from '../lib/framework-root';
import { migrateKernelImports } from '../lib/kernel-codemod';
import {
  adoptKernelPackage,
  hasCopiedKernel,
  modifiedKernelFiles,
} from '../lib/kernel-dependency';
import { migrateLegacyRegistries } from '../lib/legacy-registries';
import { KERNEL_PACKAGE } from '../lib/kernel-public-api';

export function registerKernelMigrateCommand(program: Command): void {
  program
    .command('kernel:migrate [paths...]')
    .description(
      `Rewrite #kernel/public/<entry> imports to ${KERNEL_PACKAGE}/<entry> and map ${KERNEL_PACKAGE}/* in each tsconfig, under packages/ unless paths are given, turn the kernel model lists into /// @hery.* annotations of prisma/schema.prisma, replace a copied src/technical with the ${KERNEL_PACKAGE} dependency when it is unmodified, and remove the convention scripts an older "hery new" copied into scripts/ when they are unmodified, keeping the others with a warning. Safe to run again.`,
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
      const root = process.cwd();
      const reference = frameworkRoot();
      const write = options.check !== true;
      const isProject = realpathSync(root) !== realpathSync(reference);
      const copiedKernel = isProject && hasCopiedKernel(root);

      if (copiedKernel) {
        const modified = modifiedKernelFiles(root, reference);

        if (modified.length > 0) {
          console.error(
            pc.red(
              `✖ src/technical is not the kernel this CLI ships: ${modified.length} file(s) differ from ${reference}. Nothing was changed. Move these changes out of the kernel, or restore the files, then run again:`,
            ),
          );
          modified.forEach((file) => console.error(pc.red(`  ${file}`)));
          process.exitCode = 1;
          return;
        }
      }

      const conventionScripts = isProject
        ? copiedConventionScripts(root)
        : { identical: [], modified: [] };

      conventionScripts.modified.forEach((file) =>
        console.warn(
          pc.yellow(
            `! ${file} differs from every version HeryJs shipped, so it stays: "hery check" runs the conventions from ${KERNEL_PACKAGE} now. Move what you changed into your own code, or delete it.`,
          ),
        ),
      );

      const changed = new Set([
        ...removeCopiedConventionScripts(root, conventionScripts, { write }),
        ...migrateKernelImports(root, paths.length > 0 ? paths : ['packages'], {
          peerRange: options.peer,
          write,
        }),
        ...migrateLegacyRegistries(root, { write }).map(
          (annotation) => `prisma/schema.prisma: ${annotation}`,
        ),
        ...(copiedKernel ? adoptKernelPackage(root, reference, { write }) : []),
      ]);

      if (changed.size === 0) {
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

      if (copiedKernel && write) {
        console.log(
          pc.cyan(
            `Run "pnpm install": ${KERNEL_PACKAGE} now comes from ${reference}.`,
          ),
        );
      }
    });
}
