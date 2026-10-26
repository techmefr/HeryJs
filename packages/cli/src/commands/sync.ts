import type { Command } from 'commander';
import pc from 'picocolors';
import { installedKernelSchema, syncKernelSchema } from '../lib/kernel-sync';
import { KERNEL_SCHEMA } from '../lib/schema-patch';

export function runSync(root: string, check: boolean): number {
  const differed = syncKernelSchema(root, installedKernelSchema(root), {
    write: !check,
  });

  if (!differed) {
    console.log(pc.green(`✔ ${KERNEL_SCHEMA} matches the installed kernel`));
    return 0;
  }

  if (check) {
    console.error(
      pc.red(
        `✖ ${KERNEL_SCHEMA} is not the installed kernel's schema: run "pnpm hery sync"`,
      ),
    );
    return 1;
  }

  console.log(pc.green(`✔ ${KERNEL_SCHEMA} synced from the installed kernel`));
  return 0;
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description(
      "Write the installed @heryjs/core schema to prisma/schema/_hery/core.prisma, keeping the relations and fields the project and its modules add to the kernel's models.",
    )
    .option('--check', 'Fail instead of writing when the schema is behind')
    .action((options: { check?: boolean }) => {
      process.exitCode = runSync(process.cwd(), options.check === true);
    });
}
