import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { Client } from 'pg';
import { childEnv } from '#technical/config/child-env';

export class DatabaseBackupError extends Error {}

export const DEFAULT_BACKUP_DIR = 'backups';
export const DEFAULT_BACKUP_KEEP = 7;

const BACKUP_EXTENSION = '.dump';
const BACKUP_FILE = /^(?<database>.+)-(?<stamp>\d{8}T\d{6}Z)\.dump$/;
const LATEST = 'latest';

export interface BackupFile {
  name: string;
  database: string;
  createdAt: Date;
  sizeBytes: number;
}

export interface BackupOptions {
  databaseUrl: string;
  directory: string;
  keep: number;
  isCompressed?: boolean;
  now?: Date;
}

export interface BackupResult {
  file: BackupFile;
  path: string;
  removed: string[];
}

export interface RestoreOptions {
  databaseUrl: string;
  file: string;
  isForced: boolean;
}

interface Connection {
  database: string;
  env: NodeJS.ProcessEnv;
}

/**
 * The password travels in PGPASSWORD rather than in the arguments, so it never
 * shows up in a process listing, and the client tools never see a URL carrying
 * a Prisma-only parameter such as `schema=` that libpq would reject.
 */
function connectionOf(databaseUrl: string): Connection {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new DatabaseBackupError(
      'DATABASE_URL is not a valid connection URL.',
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const env: NodeJS.ProcessEnv = childEnv({ PGDATABASE: database });

  if (parsed.hostname) env.PGHOST = parsed.hostname;
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);

  const sslmode = parsed.searchParams.get('sslmode');

  if (sslmode) env.PGSSLMODE = sslmode;

  return { database, env };
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        new DatabaseBackupError(
          error.code === 'ENOENT'
            ? `${command} was not found on the PATH. Install the PostgreSQL client tools, in the same major version as the server (pg_dump refuses to dump a newer server).`
            : error.message,
        ),
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new DatabaseBackupError(
          `${command} exited with ${code}: ${stderr.trim() || 'no output'}`,
        ),
      );
    });
  });
}

export function backupFileName(database: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

  return `${database}-${stamp}${BACKUP_EXTENSION}`;
}

export function parseBackupName(
  name: string,
): { database: string; createdAt: Date } | null {
  const match = BACKUP_FILE.exec(name);

  if (!match?.groups) {
    return null;
  }

  const { database, stamp } = match.groups as {
    database: string;
    stamp: string;
  };
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;

  return { database, createdAt: new Date(iso) };
}

export function expiredBackups(
  files: BackupFile[],
  keep: number,
): BackupFile[] {
  return [...files]
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(keep);
}

export async function listBackups(
  directory: string,
  database?: string,
): Promise<BackupFile[]> {
  let names: string[];

  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: BackupFile[] = [];

  for (const name of names) {
    const parsed = parseBackupName(name);

    if (!parsed || (database && parsed.database !== database)) {
      continue;
    }

    const { size } = await stat(path.join(directory, name));
    files.push({ name, ...parsed, sizeBytes: size });
  }

  return files.sort((left, right) => right.name.localeCompare(left.name));
}

/**
 * Custom format (-Fc) is already compressed and is what pg_restore reads
 * directly, which is why compression is a level of the dump rather than a
 * gzip pass on top: a gzipped custom dump would need unpacking before every
 * restore and would save almost nothing.
 */
export async function createBackup(
  options: BackupOptions,
): Promise<BackupResult> {
  if (!Number.isInteger(options.keep) || options.keep < 1) {
    throw new DatabaseBackupError('keep must be a whole number of at least 1.');
  }

  const { database, env } = connectionOf(options.databaseUrl);
  const name = backupFileName(database, options.now ?? new Date());
  const target = path.join(options.directory, name);

  await mkdir(options.directory, { recursive: true });

  try {
    await run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        ...(options.isCompressed === false ? ['--compress=0'] : []),
        `--file=${target}`,
      ],
      env,
    );
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }

  const existing = await listBackups(options.directory, database);
  const removed = expiredBackups(existing, options.keep).map(
    (file) => file.name,
  );

  for (const old of removed) {
    await rm(path.join(options.directory, old), { force: true });
  }

  const file = existing.find((entry) => entry.name === name) as BackupFile;

  return { file, path: target, removed };
}

function quoted(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * A restore never guesses: it refuses when any user table already holds a row,
 * because pg_restore --clean drops what it recreates and the rows in those
 * tables would go with it. An empty migrated database passes -- that is the
 * normal restore target after `prisma migrate deploy` -- and --clean
 * --if-exists lets the dump replace the empty tables it finds there.
 */
export async function databaseHasData(databaseUrl: string): Promise<boolean> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const tables = await client.query<{ schema: string; name: string }>(
      `SELECT n.nspname AS schema, c.relname AS name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'`,
    );

    for (const { schema, name } of tables.rows) {
      const found = await client.query(
        `SELECT 1 FROM ONLY ${quoted(schema)}.${quoted(name)} LIMIT 1`,
      );

      if (found.rows.length > 0) {
        return true;
      }
    }

    return false;
  } finally {
    await client.end();
  }
}

export async function resolveBackup(
  reference: string,
  directory: string,
  database: string,
): Promise<string> {
  if (reference === LATEST) {
    const [newest] = await listBackups(directory, database);

    if (!newest) {
      throw new DatabaseBackupError(
        `There is no backup of ${database} in ${directory}.`,
      );
    }

    return path.join(directory, newest.name);
  }

  return reference.includes('/') || reference.includes(path.sep)
    ? reference
    : path.join(directory, reference);
}

export function databaseNameOf(databaseUrl: string): string {
  return connectionOf(databaseUrl).database;
}

export async function restoreBackup(options: RestoreOptions): Promise<void> {
  const { database, env } = connectionOf(options.databaseUrl);

  try {
    await stat(options.file);
  } catch {
    throw new DatabaseBackupError(`${options.file} does not exist.`);
  }

  if (!options.isForced && (await databaseHasData(options.databaseUrl))) {
    throw new DatabaseBackupError(
      'The target database already holds data, and a restore replaces it. Pass --force if you really mean to overwrite it.',
    );
  }

  await run(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--exit-on-error',
      '--single-transaction',
      '--dbname',
      database,
      options.file,
    ],
    env,
  );
}
