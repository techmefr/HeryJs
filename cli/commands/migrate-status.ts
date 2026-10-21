import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  isSynchronized,
  migrationStatus,
  readAppliedMigrations,
} from '../lib/database';
import type { MigrationState, MigrationStatusRow } from '../lib/database';
import { requireDatabaseUrl, withClient } from '../lib/database-session';

const MIGRATIONS_DIR = path.join('prisma', 'migrations');

const LABELS: Record<MigrationState, (text: string) => string> = {
  applied: pc.green,
  pending: pc.yellow,
  failed: pc.red,
  missing: pc.red,
};

const EXPLANATIONS: Record<MigrationState, string> = {
  applied: '',
  pending: '',
  failed: 'failed halfway; resolve it with "prisma migrate resolve"',
  missing: 'applied here, but its directory is not in prisma/migrations',
};

export function localMigrations(root: string): string[] {
  const dir = path.join(root, MIGRATIONS_DIR);

  return readdirSync(dir)
    .filter((entry) => statSync(path.join(dir, entry)).isDirectory())
    .sort();
}

export function formatStatus(rows: MigrationStatusRow[]): string {
  if (rows.length === 0) {
    return 'No migrations.';
  }

  const width = Math.max(...rows.map((row) => row.name.length));

  return rows
    .map((row) =>
      `${LABELS[row.state](row.state.padEnd(7))}  ${row.name.padEnd(width)}  ${pc.dim(EXPLANATIONS[row.state])}`.trimEnd(),
    )
    .join('\n');
}

export function registerMigrateStatusCommand(program: Command): void {
  program
    .command('migrate:status')
    .description(
      'Show which migrations are applied, pending, failed or missing',
    )
    .option('--check', 'Exit with 1 unless every migration is applied')
    .action(async (options: { check?: boolean }) => {
      try {
        const applied = await withClient(requireDatabaseUrl(), (client) =>
          readAppliedMigrations(client),
        );
        const rows = migrationStatus(localMigrations(process.cwd()), applied);

        console.log(formatStatus(rows));

        if (options.check && !isSynchronized(rows)) {
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(
          pc.red(error instanceof Error ? error.message : String(error)),
        );
        process.exitCode = 1;
      }
    });
}
