import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';

const MIGRATIONS_DIR = path.join('prisma', 'migrations');

/**
 * Prisma has no down migration and is not going to grow one: a migration is a
 * forward SQL script, and the state before it exists only as "the migrations
 * that came earlier". So the revert is derived rather than stored -- diff the
 * live database against the migration history minus its last entry, and the
 * SQL that closes that gap is the down script.
 *
 * Derived means it can be wrong in the one way that matters: a diff describes
 * shape, not content, so dropping a column reverts the schema and destroys
 * every value in it. That is why nothing here applies anything by default.
 */
export function appliedMigrations(root: string): string[] {
  const dir = path.join(root, MIGRATIONS_DIR);

  return readdirSync(dir)
    .filter((entry) => statSync(path.join(dir, entry)).isDirectory())
    .sort();
}

/**
 * The history without its last entry, in a throwaway directory. Prisma reads a
 * migration history from disk, so "the state before the last migration" has to
 * be handed to it as a directory that genuinely lacks it -- the real one is
 * never touched.
 */
export function historyWithoutLast(root: string, migrations: string[]): string {
  const scratch = mkdtempSync(path.join(tmpdir(), 'hery-migrate-down-'));
  const target = path.join(scratch, 'migrations');

  cpSync(path.join(root, MIGRATIONS_DIR), target, { recursive: true });
  rmSync(path.join(target, migrations[migrations.length - 1] as string), {
    recursive: true,
    force: true,
  });

  return target;
}

export function registerMigrateDownCommand(program: Command): void {
  program
    .command('migrate:down')
    .description(
      'Print the SQL that reverts the last migration (use --apply to run it)',
    )
    .option('--apply', 'Run the SQL instead of printing it')
    .option(
      '--shadow-database-url <url>',
      'Empty database Prisma may replay the history into',
    )
    .action((options: { apply?: boolean; shadowDatabaseUrl?: string }) => {
      const root = process.cwd();
      const migrations = appliedMigrations(root);

      if (migrations.length === 0) {
        console.error(pc.red('There is no migration to revert.'));
        process.exitCode = 1;
        return;
      }

      const shadowUrl =
        options.shadowDatabaseUrl ?? process.env.SHADOW_DATABASE_URL;

      // Replaying a history needs a database of its own, and silently borrowing
      // the real one would drop every table in it to do so.
      if (!shadowUrl) {
        console.error(
          pc.red(
            'Reverting needs an empty database to replay the earlier migrations into.\nPass --shadow-database-url, or set SHADOW_DATABASE_URL.',
          ),
        );
        process.exitCode = 1;
        return;
      }

      const last = migrations[migrations.length - 1] as string;
      const target = historyWithoutLast(root, migrations);

      const result = spawnSync(
        'npx',
        [
          'prisma',
          'migrate',
          'diff',
          '--from-schema-datasource',
          path.join('prisma', 'schema.prisma'),
          '--to-migrations',
          target,
          '--shadow-database-url',
          shadowUrl,
          '--script',
        ],
        { encoding: 'utf8', shell: process.platform === 'win32' },
      );

      rmSync(path.dirname(target), { recursive: true, force: true });

      if (result.status !== 0) {
        console.error(pc.red(result.stderr || 'prisma migrate diff failed'));
        process.exitCode = result.status ?? 1;
        return;
      }

      const sql = result.stdout;

      if (!options.apply) {
        console.log(pc.bold(`-- Reverts ${last}`));
        console.log(sql);
        console.log(
          pc.yellow(
            'Read it before running it. A diff reverts shape, not content: a dropped\ncolumn takes its values with it, and no migration brings those back.\nRe-run with --apply once you are satisfied.',
          ),
        );
        return;
      }

      const applied = spawnSync(
        'npx',
        [
          'prisma',
          'db',
          'execute',
          '--stdin',
          '--schema',
          path.join('prisma', 'schema.prisma'),
        ],
        {
          input: sql,
          stdio: ['pipe', 'inherit', 'inherit'],
          shell: process.platform === 'win32',
        },
      );

      if (applied.status !== 0) {
        process.exitCode = applied.status ?? 1;
        return;
      }

      console.log(pc.green(`✔ reverted ${last}`));
      console.log(
        pc.yellow(
          `The migration directory still holds ${last}. Delete it, or the next\nmigrate will replay what you just reverted.`,
        ),
      );
    });
}
