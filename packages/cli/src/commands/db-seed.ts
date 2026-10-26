import type { Command } from 'commander';
import pc from 'picocolors';
import { seedDatabase } from '../lib/prisma-cli';
import { guardReset, rebuildDatabase } from './migrate-fresh';

export function registerDbSeedCommand(program: Command): void {
  program
    .command('db:seed')
    .description('Run prisma/seed.ts; --fresh resets the database first')
    .option(
      '--fresh',
      'Drop and re-migrate before seeding (refuses in production)',
    )
    .option(
      '--force',
      'Allow --fresh on a database that is not on this machine',
    )
    .action((options: { fresh?: boolean; force?: boolean }) => {
      try {
        if (!options.fresh) {
          process.exitCode = seedDatabase();
          return;
        }

        if (!guardReset(Boolean(options.force))) {
          return;
        }

        process.exitCode = rebuildDatabase(true);
      } catch (error) {
        console.error(
          pc.red(error instanceof Error ? error.message : String(error)),
        );
        process.exitCode = 1;
      }
    });
}
