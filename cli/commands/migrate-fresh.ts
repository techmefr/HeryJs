import type { Command } from 'commander';
import pc from 'picocolors';
import { resetVerdict } from '../lib/database';
import { requireDatabaseUrl } from '../lib/database-session';
import { generateClient, resetDatabase, seedDatabase } from '../lib/prisma-cli';

export function guardReset(isForced: boolean): boolean {
  const verdict = resetVerdict({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: requireDatabaseUrl(),
    isForced,
  });

  if (!verdict.isAllowed) {
    console.error(pc.red(verdict.reason ?? 'Refusing to reset this database.'));
    process.exitCode = 1;
  }

  return verdict.isAllowed;
}

export function rebuildDatabase(shouldSeed: boolean): number {
  const reset = resetDatabase();

  if (reset !== 0) {
    return reset;
  }

  const generated = generateClient();

  if (generated !== 0 || !shouldSeed) {
    return generated;
  }

  return seedDatabase();
}

export function registerMigrateFreshCommand(program: Command): void {
  program
    .command('migrate:fresh')
    .description(
      'Drop every table, replay all migrations (refuses in production)',
    )
    .option('--seed', 'Run the seeder afterwards')
    .option('--force', 'Allow a database that is not on this machine')
    .action((options: { seed?: boolean; force?: boolean }) => {
      try {
        if (!guardReset(Boolean(options.force))) {
          return;
        }

        process.exitCode = rebuildDatabase(Boolean(options.seed));
      } catch (error) {
        console.error(
          pc.red(error instanceof Error ? error.message : String(error)),
        );
        process.exitCode = 1;
      }
    });
}
