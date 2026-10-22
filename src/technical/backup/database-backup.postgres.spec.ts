import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from 'pg';
import { createBackup, listBackups, restoreBackup } from './database-backup';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://heryjs:heryjs@localhost:5432/heryjs';

function urlFor(database: string): string {
  const url = new URL(DATABASE_URL);
  url.pathname = `/${database}`;

  return url.toString();
}

async function inDatabase<T>(
  database: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: urlFor(database) });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const SERVER_MAJOR_SCRIPT = `
const { Client } = require(process.argv[1]);
const client = new Client({ connectionString: process.argv[2] });
client
  .connect()
  .then(() => client.query('SHOW server_version_num'))
  .then((result) => {
    process.stdout.write(String(Math.floor(Number(result.rows[0].server_version_num) / 10000)));
    return client.end();
  });
`;

function majorOf(versionOutput: string): number {
  return Number(/(\d+)(?:\.\d+)?/.exec(versionOutput)?.[1]);
}

function missingBackupTools(): string | null {
  if (process.env.CI) {
    return null;
  }

  let clientMajor: number;
  try {
    clientMajor = majorOf(
      execFileSync('pg_dump', ['--version'], { encoding: 'utf8' }),
    );
  } catch {
    return 'pg_dump is not on the PATH';
  }

  const serverMajor = Number(
    execFileSync(
      process.execPath,
      ['-e', SERVER_MAJOR_SCRIPT, require.resolve('pg'), urlFor('postgres')],
      { encoding: 'utf8' },
    ),
  );

  return clientMajor < serverMajor
    ? `pg_dump ${clientMajor} cannot dump a PostgreSQL ${serverMajor} server`
    : null;
}

const skipReason = missingBackupTools();

if (skipReason) {
  console.warn(`Skipping the backup round trip locally: ${skipReason}.`);
}

// Needs a live Postgres and the pg_dump / pg_restore client tools. On a
// workstation without matching client tools it is skipped with the reason
// above; under CI it always runs, so a broken runner fails instead of
// skipping. The point is the round trip: a dump that was never restored is
// not a backup.
(skipReason ? describe.skip : describe)('database backup and restore', () => {
  const suffix = randomBytes(4).toString('hex');
  const source = `hery_bak_${suffix}`;
  const fresh = `hery_bak_${suffix}_fresh`;
  const overwritten = `hery_bak_${suffix}_overwritten`;
  let admin: Client;
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'hery-backup-spec-'));
    admin = new Client({ connectionString: urlFor('postgres') });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${source}"`);
    await admin.query(`CREATE DATABASE "${fresh}"`);
    await admin.query(`CREATE DATABASE "${overwritten}"`);
    await inDatabase(source, async (client) => {
      await client.query('CREATE TABLE note (id int PRIMARY KEY, body text)');
      await client.query("INSERT INTO note VALUES (1, 'first'), (2, 'second')");
    });
  });

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${source}" WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS "${fresh}" WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS "${overwritten}" WITH (FORCE)`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  });

  it('restores a dump into an empty database', async () => {
    const { path: dump } = await createBackup({
      databaseUrl: urlFor(source),
      directory,
      keep: 5,
      now: new Date('2026-10-20T03:00:00Z'),
    });

    await restoreBackup({
      databaseUrl: urlFor(fresh),
      file: dump,
      isForced: false,
    });

    const rows = await inDatabase(fresh, (client) =>
      client.query<{ body: string }>('SELECT body FROM note ORDER BY id'),
    );
    expect(rows.rows.map((row) => row.body)).toEqual(['first', 'second']);
  });

  it('refuses to restore over data, and overwrites it with --force', async () => {
    const own = await mkdtemp(path.join(directory, 'force-'));
    const { path: dump } = await createBackup({
      databaseUrl: urlFor(source),
      directory: own,
      keep: 5,
      now: new Date('2026-10-20T04:00:00Z'),
    });
    await restoreBackup({
      databaseUrl: urlFor(overwritten),
      file: dump,
      isForced: false,
    });

    await inDatabase(overwritten, (client) =>
      client.query("UPDATE note SET body = 'changed' WHERE id = 1"),
    );

    await expect(
      restoreBackup({
        databaseUrl: urlFor(overwritten),
        file: dump,
        isForced: false,
      }),
    ).rejects.toThrow(/already holds data/);

    const untouched = await inDatabase(overwritten, (client) =>
      client.query<{ body: string }>('SELECT body FROM note WHERE id = 1'),
    );
    expect(untouched.rows[0]?.body).toBe('changed');

    await restoreBackup({
      databaseUrl: urlFor(overwritten),
      file: dump,
      isForced: true,
    });

    const restored = await inDatabase(overwritten, (client) =>
      client.query<{ body: string }>('SELECT body FROM note WHERE id = 1'),
    );
    expect(restored.rows[0]?.body).toBe('first');
  });

  it('keeps only the newest dumps and removes the rest', async () => {
    for (const day of ['21', '22', '23']) {
      await createBackup({
        databaseUrl: urlFor(source),
        directory,
        keep: 2,
        now: new Date(`2026-10-${day}T03:00:00Z`),
      });
    }

    const names = (await listBackups(directory, source)).map(
      (entry) => entry.name,
    );

    expect(names).toEqual([
      `${source}-20261023T030000Z.dump`,
      `${source}-20261022T030000Z.dump`,
    ]);
  });

  it('reports a missing dump instead of running pg_restore', async () => {
    await expect(
      restoreBackup({
        databaseUrl: urlFor(fresh),
        file: path.join(directory, 'absent.dump'),
        isForced: true,
      }),
    ).rejects.toThrow(/does not exist/);
  });
});
