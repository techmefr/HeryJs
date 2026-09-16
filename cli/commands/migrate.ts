import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  migrationTimestamp,
  pendingRlsModels,
  writeRlsMigration,
} from '../lib/rls';

/**
 * `prisma migrate dev` does not always regenerate the client -- applying an
 * existing migration leaves the previous one in place -- while still reporting
 * that the database is in sync with the schema. The two statements together
 * are what cost an afternoon: better-auth refused every registration against a
 * table the database already had, because the client did not know about it.
 */
function runPrismaGenerate(): number {
  const result = spawnSync('npx', ['prisma', 'generate'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return result.status ?? 1;
}

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
        process.exitCode = runPrismaGenerate();
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

      const applied = runPrismaMigrate();

      process.exitCode = applied === 0 ? runPrismaGenerate() : applied;
    });
}
