import { spawnSync } from 'node:child_process';
import { parseArgv } from '../lib/argv';

export function runMigrate(argv: string[]): void {
  const { flags } = parseArgv(argv);
  const migrateArgs = ['prisma', 'migrate', 'dev'];

  if (typeof flags.name === 'string') {
    migrateArgs.push('--name', flags.name);
  }

  const result = spawnSync('npx', migrateArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  process.exitCode = result.status ?? 1;
}
