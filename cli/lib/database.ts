import type { QueryResult, QueryResultRow } from 'pg';

export interface SqlClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export class DatabaseWorkflowError extends Error {}

const LOCAL_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
];
const BRANCH_NAME = /^[a-z][a-z0-9_]{0,30}$/;
const BRANCH_INFIX = '_branch_';
const MAX_IDENTIFIER_LENGTH = 63;
const MAINTENANCE_DATABASE = 'postgres';
const UNDEFINED_TABLE = '42P01';

export interface ResetVerdict {
  isAllowed: boolean;
  reason: string | null;
}

export function resetVerdict(input: {
  nodeEnv: string | undefined;
  databaseUrl: string;
  isForced: boolean;
}): ResetVerdict {
  if (input.nodeEnv === 'production') {
    return {
      isAllowed: false,
      reason:
        'NODE_ENV is production. Wiping a production database is not something this command will do, with or without --force.',
    };
  }

  const { host } = parseConnection(input.databaseUrl);

  if (!isLocalHost(host) && !input.isForced) {
    return {
      isAllowed: false,
      reason: `${host} is not a local database. Pass --force if you really mean to wipe it.`,
    };
  }

  return { isAllowed: true, reason: null };
}

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.includes(host.toLowerCase());
}

export interface Connection {
  host: string;
  database: string;
}

export function parseConnection(databaseUrl: string): Connection {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new DatabaseWorkflowError(
      'DATABASE_URL is not a valid connection URL.',
    );
  }

  return {
    host: parsed.hostname,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  };
}

export function connectionUrlFor(
  databaseUrl: string,
  database: string,
): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${encodeURIComponent(database)}`;

  return parsed.toString();
}

export function maintenanceUrl(databaseUrl: string): string {
  return connectionUrlFor(databaseUrl, MAINTENANCE_DATABASE);
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function isValidBranchName(name: string): boolean {
  return BRANCH_NAME.test(name);
}

export function branchDatabaseName(source: string, name: string): string {
  if (!isValidBranchName(name)) {
    throw new DatabaseWorkflowError(
      `"${name}" is not a valid branch name. Use lowercase letters, digits and underscores, starting with a letter, 31 characters at most.`,
    );
  }

  const database = `${source}${BRANCH_INFIX}${name}`;

  if (database.length > MAX_IDENTIFIER_LENGTH) {
    throw new DatabaseWorkflowError(
      `${database} is longer than the ${MAX_IDENTIFIER_LENGTH} characters Postgres allows in a database name. Use a shorter branch name.`,
    );
  }

  return database;
}

async function databaseExists(
  client: SqlClient,
  database: string,
): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [database],
  );

  return result.rows.length > 0;
}

async function openConnections(
  client: SqlClient,
  database: string,
): Promise<number> {
  const result = await client.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [database],
  );

  return result.rows[0]?.count ?? 0;
}

export async function createBranch(
  client: SqlClient,
  source: string,
  name: string,
): Promise<string> {
  const target = branchDatabaseName(source, name);

  if (!(await databaseExists(client, source))) {
    throw new DatabaseWorkflowError(`The database ${source} does not exist.`);
  }

  if (await databaseExists(client, target)) {
    throw new DatabaseWorkflowError(
      `The branch ${name} already exists (${target}). Drop it first, or pick another name.`,
    );
  }

  const connections = await openConnections(client, source);

  if (connections > 0) {
    throw new DatabaseWorkflowError(
      `${source} has ${connections} open connection(s), and Postgres cannot copy a database somebody is connected to. Stop the dev server and anything else using it, then retry.`,
    );
  }

  await client.query(
    `CREATE DATABASE ${quoteIdentifier(target)} TEMPLATE ${quoteIdentifier(source)}`,
  );

  return target;
}

export async function dropBranch(
  client: SqlClient,
  source: string,
  name: string,
): Promise<string> {
  const target = branchDatabaseName(source, name);

  if (!(await databaseExists(client, target))) {
    throw new DatabaseWorkflowError(
      `There is no branch named ${name} (${target}).`,
    );
  }

  await client.query(`DROP DATABASE ${quoteIdentifier(target)} WITH (FORCE)`);

  return target;
}

export async function listBranches(
  client: SqlClient,
  source: string,
): Promise<string[]> {
  const prefix = `${source}${BRANCH_INFIX}`;
  const result = await client.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE starts_with(datname, $1) ORDER BY datname',
    [prefix],
  );

  return result.rows.map((row) => row.datname.slice(prefix.length));
}

export interface AppliedMigration {
  name: string;
  isFinished: boolean;
  isRolledBack: boolean;
}

export type MigrationState = 'applied' | 'pending' | 'failed' | 'missing';

export interface MigrationStatusRow {
  name: string;
  state: MigrationState;
}

export async function readAppliedMigrations(
  client: SqlClient,
): Promise<AppliedMigration[]> {
  try {
    const result = await client.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
    );

    return result.rows.map((row) => ({
      name: row.migration_name,
      isFinished: row.finished_at !== null,
      isRolledBack: row.rolled_back_at !== null,
    }));
  } catch (error) {
    if ((error as { code?: string }).code === UNDEFINED_TABLE) {
      return [];
    }

    throw error;
  }
}

export function migrationStatus(
  local: string[],
  applied: AppliedMigration[],
): MigrationStatusRow[] {
  const byName = new Map(applied.map((entry) => [entry.name, entry]));
  const onDisk = new Set(local);

  const known = local.map((name): MigrationStatusRow => {
    const entry = byName.get(name);

    if (!entry || entry.isRolledBack) {
      return { name, state: 'pending' };
    }

    return { name, state: entry.isFinished ? 'applied' : 'failed' };
  });

  const missing = applied
    .filter((entry) => !onDisk.has(entry.name) && !entry.isRolledBack)
    .map((entry): MigrationStatusRow => ({
      name: entry.name,
      state: 'missing',
    }));

  return [...known, ...missing].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function isSynchronized(rows: MigrationStatusRow[]): boolean {
  return rows.every((row) => row.state === 'applied');
}
