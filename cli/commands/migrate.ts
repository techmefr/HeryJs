import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate')
    .description('Run Prisma migrate dev')
    .option('--name <name>', 'Migration name')
    .action((options: { name?: string }) => {
      const migrateArgs = ['prisma', 'migrate', 'dev'];

      if (options.name) {
        migrateArgs.push('--name', options.name);
      }

      console.log(pc.cyan(`Running: npx ${migrateArgs.join(' ')}`));

      const result = spawnSync('npx', migrateArgs, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      process.exitCode = result.status ?? 1;
    });
}
