/**
 * Naming only, so the setup file that runs inside every test file and the
 * global setup that provisions the databases agree on one rule without the
 * former having to load a Postgres client.
 */
export const SHARED_DB_FLAG = 'JEST_SHARED_DB';
export const BASE_URL_VARIABLE = 'JEST_DB_BASE_URL';
export const MIGRATION_BASE_URL_VARIABLE = 'JEST_DB_MIGRATION_BASE_URL';
export const WORKER_COUNT_VARIABLE = 'JEST_DB_WORKERS';

// Valkey and Redis ship 16 logical databases, which is the most workers that
// can each have a keyspace of their own.
export const REDIS_DATABASES = 16;

export function isSharedDatabase(): boolean {
  return process.env[SHARED_DB_FLAG] === 'true';
}

export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function withDatabase(url: string, database: string): string {
  const next = new URL(url);

  next.pathname = `/${encodeURIComponent(database)}`;

  return next.toString();
}

export function workerDatabaseName(baseName: string, workerId: number): string {
  return `${baseName}_w${workerId}`;
}

export function withRedisDatabase(url: string, workerId: number): string {
  const next = new URL(url);

  next.pathname = `/${(workerId - 1) % REDIS_DATABASES}`;

  return next.toString();
}
