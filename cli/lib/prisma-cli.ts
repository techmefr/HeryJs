import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const IS_WINDOWS = process.platform === 'win32';

export const SCHEMA_PATH = path.join('prisma', 'schema.prisma');

export function runPrisma(args: string[]): number {
  const result = spawnSync('npx', ['prisma', ...args], {
    stdio: 'inherit',
    shell: IS_WINDOWS,
  });

  return result.status ?? 1;
}

export interface CapturedPrisma {
  status: number;
  stdout: string;
  stderr: string;
}

export function capturePrisma(args: string[]): CapturedPrisma {
  const result = spawnSync('npx', ['prisma', ...args], {
    encoding: 'utf8',
    shell: IS_WINDOWS,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function resetDatabase(): number {
  return runPrisma(['migrate', 'reset', '--force']);
}

export function seedDatabase(): number {
  return runPrisma(['db', 'seed']);
}

export function generateClient(): number {
  return runPrisma(['generate']);
}
