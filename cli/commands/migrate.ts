import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  migrationTimestamp,
  pendingRlsModels,
  writeRlsMigration,
} from '../lib/rls';

function runPrismaMigrate(name?: string): number {
  const migrateArgs = ['prisma', 'migrate', 'dev'];

  if (name) {
    migrateArgs.push('--name', name);
  }

  console.log(pc.cyan(`Running: npx ${migrateArgs.join(' ')}`));

  const result = spawnSync('npx', migrateArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return result.status ?? 1;
}

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate')
    .description('Run Prisma migrate dev')
    .option('--name <name>', 'Migration name')
    .action((options: { name?: string }) => {
      const status = runPrismaMigrate(options.name);

      if (status !== 0) {
        process.exitCode = status;
        return;
      }

      // Second pass, after the tables exist: a tenant-scoped model needs a
      // row-level policy behind the extension that scopes it, and writing that
      // migration by hand is what got forgotten for the teams tables. The
      // schema and TENANT_SCOPED_MODELS already say which models those are, so
      // the policy is emitted from them rather than remembered.
      const root = process.cwd();
      const pending = pendingRlsModels(root);

      if (pending.length === 0) {
        return;
      }

      const dir = writeRlsMigration(
        root,
        pending,
        migrationTimestamp(new Date()),
      );

      console.log(
        pc.green(
          `✔ ${path.relative(root, dir)} — row level security for ${pending
            .map((model) => model.name)
            .join(', ')}`,
        ),
      );

      process.exitCode = runPrismaMigrate();
    });
}
