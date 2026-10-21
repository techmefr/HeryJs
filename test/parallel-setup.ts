/**
 * Gives every jest worker a database of its own, built from the migrations.
 *
 * The suite used to share one database between every worker: specs stayed out
 * of each other's way by inventing unique ids, and the few that could not (the
 * outbox relay drains the whole table) tolerated a race. That holds until a
 * spec crashes half-way through a write, or a new one counts rows.
 *
 * Migrating a database from empty takes seconds, so it is done once into a
 * template named after a hash of the migrations, and each worker's database is
 * a `CREATE DATABASE ... TEMPLATE` copy of it, which takes a fraction of a
 * second. The copies are dropped and recreated on every run, so a run never
 * starts from what the previous one left behind.
 *
 * JEST_SHARED_DB=true skips all of it and runs against DATABASE_URL as before.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';
import {
  BASE_URL_VARIABLE,
  WORKER_COUNT_VARIABLE,
  databaseNameOf,
  isSharedDatabase,
  withDatabase,
  workerDatabaseName,
} from './parallel-db';
import loadEnvBeforeTests from './global-setup';

const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(REPO_ROOT, 'prisma', 'migrations');
const MAINTENANCE_DATABASE = 'postgres';
const LOCK_KEY = 162_162;

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function migrationsHash(): string {
  const hash = createHash('sha1');

  for (const name of readdirSync(MIGRATIONS).sort()) {
    const directory = path.join(MIGRATIONS, name);

    hash.update(name);

    if (statSync(directory).isDirectory()) {
      hash.update(readFileSync(path.join(directory, 'migration.sql')));
    }
  }

  return hash.digest('hex').slice(0, 10);
}

async function databaseExists(client: Client, name: string): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [name],
  );

  return result.rowCount === 1;
}

function migrate(url: string): void {
  const prisma = path.join(
    path.dirname(require.resolve('prisma/package.json')),
    'build',
    'index.js',
  );
  const result = spawnSync(process.execPath, [prisma, 'migrate', 'deploy'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `Could not migrate the template database:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function ensureTemplate(
  client: Client,
  baseUrl: string,
  templateName: string,
): Promise<void> {
  if (await databaseExists(client, templateName)) {
    return;
  }

  const baseName = databaseNameOf(baseUrl);
  const stale = await client.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE datname LIKE $1',
    [`${baseName}\\_tpl\\_%`],
  );

  for (const { datname } of stale.rows) {
    await client.query(
      `DROP DATABASE IF EXISTS ${quote(datname)} WITH (FORCE)`,
    );
  }

  await client.query(`CREATE DATABASE ${quote(templateName)}`);

  try {
    migrate(withDatabase(baseUrl, templateName));
  } catch (error) {
    await client.query(
      `DROP DATABASE IF EXISTS ${quote(templateName)} WITH (FORCE)`,
    );
    throw error;
  }
}

export default async function provisionWorkerDatabases(globalConfig: {
  maxWorkers: number;
}): Promise<void> {
  loadEnvBeforeTests();

  const baseUrl = process.env.DATABASE_URL;

  if (isSharedDatabase() || !baseUrl) {
    return;
  }

  const workers = Math.max(1, globalConfig.maxWorkers);
  const baseName = databaseNameOf(baseUrl);
  const templateName = `${baseName}_tpl_${migrationsHash()}`;
  const client = new Client({
    connectionString: withDatabase(baseUrl, MAINTENANCE_DATABASE),
  });

  await client.connect();

  try {
    // Two runs started together (two terminals, a watcher and a CI step) would
    // otherwise both build the template, or drop a worker database the other
    // is about to use.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureTemplate(client, baseUrl, templateName);

    for (let worker = 1; worker <= workers; worker += 1) {
      const name = quote(workerDatabaseName(baseName, worker));

      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.query(
        `CREATE DATABASE ${name} TEMPLATE ${quote(templateName)}`,
      );
    }

    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  } finally {
    await client.end();
  }

  process.env[BASE_URL_VARIABLE] = baseUrl;
  process.env[WORKER_COUNT_VARIABLE] = String(workers);
}
