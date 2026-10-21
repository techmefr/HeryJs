import type { Command } from 'commander';
import pc from 'picocolors';
import { capturePrisma, SCHEMA_PATH } from '../lib/prisma-cli';

const EMPTY_DIFF_EXIT = 0;
const NON_EMPTY_DIFF_EXIT = 2;

export function diffArgs(): string[] {
  return [
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    SCHEMA_PATH,
    '--script',
    '--exit-code',
  ];
}

export function registerDbDiffCommand(program: Command): void {
  program
    .command('db:diff')
    .description(
      'Print the SQL that would bring the live database to schema.prisma',
    )
    .option('--check', 'Exit with 1 when the database differs from the schema')
    .action((options: { check?: boolean }) => {
      const result = capturePrisma(diffArgs());

      if (
        result.status !== EMPTY_DIFF_EXIT &&
        result.status !== NON_EMPTY_DIFF_EXIT
      ) {
        console.error(pc.red(result.stderr || 'prisma migrate diff failed'));
        process.exitCode = result.status;
        return;
      }

      if (result.status === EMPTY_DIFF_EXIT) {
        console.log(pc.green('The database matches schema.prisma.'));
        return;
      }

      console.log(result.stdout);

      if (options.check) {
        process.exitCode = 1;
      }
    });
}
