import type { Command } from 'commander';
import pc from 'picocolors';
import {
  DEFAULT_BACKUP_DIR,
  DEFAULT_BACKUP_KEEP,
  createBackup,
  databaseNameOf,
  listBackups,
  resolveBackup,
  restoreBackup,
} from '#technical/backup/database-backup';
import { requireDatabaseUrl } from '../lib/database-session';
import { replayErasures } from './privacy-replay';

interface BackupFlags {
  dir?: string;
  keep?: string;
  compress?: boolean;
}

interface RestoreFlags {
  dir?: string;
  force?: boolean;
}

function directoryOf(flag: string | undefined): string {
  return flag ?? process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
}

function keepOf(flag: string | undefined): number {
  return Number(flag ?? process.env.BACKUP_KEEP ?? DEFAULT_BACKUP_KEEP);
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function fail(error: unknown): void {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

export function registerDbBackupCommands(program: Command): void {
  program
    .command('db:backup')
    .description(
      'Dump the database to a timestamped pg_dump file and prune old ones',
    )
    .option(
      '--dir <path>',
      `Where dumps are kept (default ${DEFAULT_BACKUP_DIR})`,
    )
    .option(
      '--keep <count>',
      `How many dumps to keep (default ${DEFAULT_BACKUP_KEEP})`,
    )
    .option('--no-compress', 'Write an uncompressed dump')
    .action(async (flags: BackupFlags) => {
      try {
        const result = await createBackup({
          databaseUrl: requireDatabaseUrl(),
          directory: directoryOf(flags.dir),
          keep: keepOf(flags.keep),
          isCompressed: flags.compress,
        });

        console.log(
          pc.green(
            `wrote ${result.path} (${formatSize(result.file.sizeBytes)})`,
          ),
        );

        for (const name of result.removed) {
          console.log(pc.dim(`removed ${name}`));
        }
      } catch (error) {
        fail(error);
      }
    });

  program
    .command('db:backups')
    .description('List the dumps of this database')
    .option(
      '--dir <path>',
      `Where dumps are kept (default ${DEFAULT_BACKUP_DIR})`,
    )
    .action(async (flags: BackupFlags) => {
      try {
        const database = databaseNameOf(requireDatabaseUrl());
        const files = await listBackups(directoryOf(flags.dir), database);

        console.log(
          files.length === 0
            ? 'No backups.'
            : files
                .map(
                  (file) =>
                    `${file.name}  ${file.createdAt.toISOString()}  ${formatSize(file.sizeBytes)}`,
                )
                .join('\n'),
        );
      } catch (error) {
        fail(error);
      }
    });

  program
    .command('db:restore <file>')
    .description('Restore a dump into the database; "latest" picks the newest')
    .option(
      '--dir <path>',
      `Where dumps are kept (default ${DEFAULT_BACKUP_DIR})`,
    )
    .option('--force', 'Overwrite a database that already holds data')
    .action(async (file: string, flags: RestoreFlags) => {
      try {
        const databaseUrl = requireDatabaseUrl();
        const path = await resolveBackup(
          file,
          directoryOf(flags.dir),
          databaseNameOf(databaseUrl),
        );

        await restoreBackup({
          databaseUrl,
          file: path,
          isForced: flags.force === true,
        });

        console.log(pc.green(`restored ${path}`));
        await replayErasures();
      } catch (error) {
        fail(error);
      }
    });
}
