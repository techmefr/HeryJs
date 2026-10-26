import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { waitFor } from '../../../../src/devtools/testing/wait-for';
import {
  connectionUrlFor,
  createBranch,
  dropBranch,
  listBranches,
  maintenanceUrl,
  readAppliedMigrations,
} from './database';

const DATABASE_URL =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  'postgresql://heryjs:heryjs@localhost:5432/heryjs';

// Every DROP DATABASE waits for an immediate checkpoint of the whole cluster,
// whose length is set by what the other workers have left dirty, not by this
// spec. Fifteen seconds is not enough for four of them under a full parallel run.
const DDL_TIMEOUT_MS = 60_000;

describe('database branches', () => {
  const source = `hery_spec_${randomBytes(4).toString('hex')}`;
  let admin: Client;

  // client.end() resolves once the socket is closed, before the server
  // backend has exited, and Postgres refuses to copy a template that still
  // shows a backend. Waiting for it to leave pg_stat_activity is what lets the
  // next test branch the source no matter which test ran before it.
  async function disconnectFromSource(client: Client): Promise<void> {
    await client.end();
    await waitFor(
      async () =>
        (
          await admin.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1',
            [source],
          )
        ).rows[0]?.count === 0,
      { description: `the last backend on ${source} to exit` },
    );
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: maintenanceUrl(DATABASE_URL) });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${source}"`);

    const seeded = new Client({
      connectionString: connectionUrlFor(DATABASE_URL, source),
    });
    await seeded.connect();
    await seeded.query('CREATE TABLE note (id int PRIMARY KEY, body text)');
    await seeded.query("INSERT INTO note VALUES (1, 'kept in the copy')");
    await disconnectFromSource(seeded);
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    await admin.query(
      `DROP DATABASE IF EXISTS "${source}_branch_copy" WITH (FORCE)`,
    );
    await admin.query(`DROP DATABASE IF EXISTS "${source}" WITH (FORCE)`);
    await admin.end();
  }, DDL_TIMEOUT_MS);

  it(
    'copies the schema and the rows into a branch, lists it, and drops it',
    async () => {
      const target = await createBranch(admin, source, 'copy');

      expect(await listBranches(admin, source)).toEqual(['copy']);

      const branch = new Client({
        connectionString: connectionUrlFor(DATABASE_URL, target),
      });
      await branch.connect();
      const rows = await branch.query<{ body: string }>(
        'SELECT body FROM note',
      );
      await branch.end();
      expect(rows.rows).toEqual([{ body: 'kept in the copy' }]);

      await expect(createBranch(admin, source, 'copy')).rejects.toThrow(
        /already exists/,
      );

      await dropBranch(admin, source, 'copy');
      expect(await listBranches(admin, source)).toEqual([]);
      await expect(dropBranch(admin, source, 'copy')).rejects.toThrow(
        /no branch/,
      );
    },
    DDL_TIMEOUT_MS,
  );

  it('says so when the source has an open connection instead of surfacing a Postgres error', async () => {
    const holder = new Client({
      connectionString: connectionUrlFor(DATABASE_URL, source),
    });
    await holder.connect();

    try {
      await expect(createBranch(admin, source, 'busy')).rejects.toThrow(
        /open connection/,
      );
    } finally {
      await disconnectFromSource(holder);
    }
  });

  it('refuses a source that does not exist', async () => {
    await expect(createBranch(admin, 'hery_spec_absent', 'x')).rejects.toThrow(
      /does not exist/,
    );
  });

  it('reads no migrations from a database that never ran one', async () => {
    const empty = new Client({
      connectionString: connectionUrlFor(DATABASE_URL, source),
    });
    await empty.connect();

    try {
      expect(await readAppliedMigrations(empty)).toEqual([]);
    } finally {
      await disconnectFromSource(empty);
    }
  });
});
