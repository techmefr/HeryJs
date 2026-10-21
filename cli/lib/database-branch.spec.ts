import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  connectionUrlFor,
  createBranch,
  dropBranch,
  listBranches,
  maintenanceUrl,
  readAppliedMigrations,
} from './database';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://heryjs:heryjs@localhost:5432/heryjs';

describe('database branches', () => {
  const source = `hery_spec_${randomBytes(4).toString('hex')}`;
  let admin: Client;

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
    await seeded.end();
  });

  afterAll(async () => {
    await admin.query(
      `DROP DATABASE IF EXISTS "${source}_branch_copy" WITH (FORCE)`,
    );
    await admin.query(`DROP DATABASE IF EXISTS "${source}" WITH (FORCE)`);
    await admin.end();
  });

  it('copies the schema and the rows into a branch, lists it, and drops it', async () => {
    const target = await createBranch(admin, source, 'copy');

    expect(await listBranches(admin, source)).toEqual(['copy']);

    const branch = new Client({
      connectionString: connectionUrlFor(DATABASE_URL, target),
    });
    await branch.connect();
    const rows = await branch.query<{ body: string }>('SELECT body FROM note');
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
  });

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
      await holder.end();
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
      await empty.end();
    }
  });
});
