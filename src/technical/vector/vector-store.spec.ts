import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';
import {
  createTenantScopedPrismaClient,
  type TenantScopedPrismaClient,
} from '#technical/prisma/prisma.client';
import { VectorStore } from './vector-store';
import type { SimilarQuery } from './vector-store';
import type { VectorTarget } from './vector-target';

describe('VectorStore (real database, pgvector)', () => {
  const suffix = randomUUID().replace(/-/g, '');
  const table = `VectorFixture_${suffix}`;
  const roleName = `heryjs_vector_test_${suffix}`;
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const target: VectorTarget = {
    table,
    column: 'embedding',
    sourceColumn: 'body',
    dimensions: 3,
    softDeletes: true,
  };

  const adminClient = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    }),
  });
  const scopedClient = createTenantScopedPrismaClient();
  const store = new VectorStore(scopedClient);
  let restrictedClient: PrismaClient;

  function insert(
    id: string,
    tenantId: string,
    embedding: number[] | null,
    options: { ownerId?: string; teamId?: string; deleted?: boolean } = {},
  ) {
    const literal = embedding ? `[${embedding.join(',')}]` : null;

    return adminClient.$executeRawUnsafe(
      `INSERT INTO "${table}" ("id", "tenantId", "ownerId", "teamId", "body", "embedding", "deletedAt")
       VALUES ($1, $2, $3, $4, $5, $6::vector, ${options.deleted ? 'NOW()' : 'NULL'})`,
      id,
      tenantId,
      options.ownerId ?? 'owner-1',
      options.teamId ?? null,
      `body of ${id}`,
      literal,
    );
  }

  function query(overrides: Partial<SimilarQuery> = {}): SimilarQuery {
    return {
      vector: [1, 0, 0],
      metric: 'cosine',
      limit: 10,
      tenantId: tenantA,
      scope: { kind: 'all' },
      trash: 'exclude',
      ...overrides,
    };
  }

  async function ids(overrides: Partial<SimilarQuery> = {}): Promise<string[]> {
    const rows = await store.similar(target, query(overrides));

    return rows.map((row) => row.id);
  }

  beforeAll(async () => {
    await adminClient.$connect();
    await adminClient.$executeRawUnsafe(
      `CREATE EXTENSION IF NOT EXISTS vector`,
    );
    await adminClient.$executeRawUnsafe(`
      CREATE TABLE "${table}" (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "teamId" TEXT,
        "body" TEXT,
        "embedding" vector(3),
        "deletedAt" TIMESTAMP(3)
      )
    `);
    await adminClient.$executeRawUnsafe(
      `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
    );
    await adminClient.$executeRawUnsafe(
      `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
    );
    await adminClient.$executeRawUnsafe(`
      CREATE POLICY tenant_isolation ON "${table}"
        USING ("tenantId" = current_setting('app.tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))
    `);

    await adminClient.$executeRawUnsafe(
      `CREATE ROLE "${roleName}" LOGIN PASSWORD 'test' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminClient.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO "${roleName}"`,
    );
    await adminClient.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${roleName}"`,
    );
    const restrictedUrl = new URL(env.DATABASE_URL);
    restrictedUrl.username = roleName;
    restrictedUrl.password = 'test';
    restrictedClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: restrictedUrl.toString() }),
    });
    await restrictedClient.$connect();
  });

  afterAll(async () => {
    await restrictedClient.$disconnect();
    await adminClient.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
    await adminClient.$executeRawUnsafe(`DROP OWNED BY "${roleName}"`);
    await adminClient.$executeRawUnsafe(`DROP ROLE IF EXISTS "${roleName}"`);
    await adminClient.$disconnect();
    await scopedClient.$disconnect();
  });

  beforeEach(async () => {
    await adminClient.$executeRawUnsafe(`DELETE FROM "${table}"`);
  });

  it('orders rows by cosine distance, nearest first, and reports the distance', async () => {
    await insert('far', tenantA, [0, 1, 0]);
    await insert('near', tenantA, [1, 0.1, 0]);
    await insert('exact', tenantA, [2, 0, 0]);

    const rows = await store.similar(target, query());

    expect(rows.map((row) => row.id)).toEqual(['exact', 'near', 'far']);
    expect(rows[0]?.distance).toBeCloseTo(0, 6);
    expect(rows[2]?.distance).toBeCloseTo(1, 6);
  });

  it('ranks by l2 distance when asked, which is not the cosine order', async () => {
    await insert('short', tenantA, [0.5, 0.5, 0]);
    await insert('aligned', tenantA, [10, 0, 0]);

    expect(await ids({ metric: 'cosine' })).toEqual(['aligned', 'short']);
    expect(await ids({ metric: 'l2' })).toEqual(['short', 'aligned']);
  });

  it('never returns another tenant row, even when it is the nearest', async () => {
    await insert('mine', tenantA, [0, 1, 0]);
    await insert('theirs', tenantB, [1, 0, 0]);

    expect(await ids()).toEqual(['mine']);
    expect(await ids({ tenantId: tenantB })).toEqual(['theirs']);
  });

  it('fills the window from rows the caller may see, not from rows it then loses', async () => {
    await insert('other-1', tenantA, [1, 0, 0], { ownerId: 'someone-else' });
    await insert('other-2', tenantA, [1, 0.01, 0], { ownerId: 'someone-else' });
    await insert('mine', tenantA, [0, 1, 0], { ownerId: 'me' });

    expect(
      await ids({ limit: 1, scope: { kind: 'owner', ownerId: 'me' } }),
    ).toEqual(['mine']);
  });

  it('restricts to the teams the caller belongs to', async () => {
    await insert('a', tenantA, [1, 0, 0], { teamId: 'team-a' });
    await insert('b', tenantA, [1, 0, 0], { teamId: 'team-b' });
    await insert('c', tenantA, [1, 0, 0], { teamId: 'team-c' });

    expect(
      (
        await ids({ scope: { kind: 'teams', teams: ['team-a', 'team-c'] } })
      ).sort(),
    ).toEqual(['a', 'c']);
  });

  it('returns nothing for a scope that grants nothing, without running a query', async () => {
    await insert('a', tenantA, [1, 0, 0]);

    expect(await ids({ scope: { kind: 'none' } })).toEqual([]);
  });

  it('skips rows that have no embedding yet', async () => {
    await insert('pending', tenantA, null);
    await insert('ready', tenantA, [1, 0, 0]);

    expect(await ids()).toEqual(['ready']);
  });

  it('hides trashed rows by default and can show them or only them', async () => {
    await insert('live', tenantA, [1, 0, 0]);
    await insert('trashed', tenantA, [1, 0, 0], { deleted: true });

    expect(await ids({ trash: 'exclude' })).toEqual(['live']);
    expect(await ids({ trash: 'only' })).toEqual(['trashed']);
    expect((await ids({ trash: 'include' })).sort()).toEqual([
      'live',
      'trashed',
    ]);
  });

  it('caps the window at the limit it is given', async () => {
    await insert('a', tenantA, [1, 0, 0]);
    await insert('b', tenantA, [0.9, 0.1, 0]);
    await insert('c', tenantA, [0.8, 0.2, 0]);

    expect(await ids({ limit: 2 })).toEqual(['a', 'b']);
  });

  it('breaks distance ties by id so a page boundary never repeats or skips a row', async () => {
    await insert('b', tenantA, [1, 0, 0]);
    await insert('a', tenantA, [1, 0, 0]);

    expect(await ids()).toEqual(['a', 'b']);
  });

  it('refuses a vector of the wrong width instead of comparing silently', async () => {
    await insert('a', tenantA, [1, 0, 0]);

    await expect(ids({ vector: [1, 0] })).rejects.toThrow();
  });

  it('refuses an identifier that is not a plain name', async () => {
    await expect(
      store.similar({ ...target, table: 'x"; DROP TABLE "y' }, query()),
    ).rejects.toThrow(/not a valid SQL identifier/);
  });

  it('writes an embedding for the row of the given tenant and reads the source back', async () => {
    await insert('a', tenantA, null);

    await store.write(target, 'a', tenantA, [0, 0, 1]);

    expect(await store.readSource(target, 'a', tenantA)).toBe('body of a');
    expect(await ids({ vector: [0, 0, 1] })).toEqual(['a']);
  });

  it('clears an embedding when written null', async () => {
    await insert('a', tenantA, [1, 0, 0]);

    await store.write(target, 'a', tenantA, null);

    expect(await ids()).toEqual([]);
  });

  it('does not write or read a row that belongs to another tenant', async () => {
    await insert('theirs', tenantB, null);

    await store.write(target, 'theirs', tenantA, [1, 0, 0]);

    expect(await store.readSource(target, 'theirs', tenantA)).toBeNull();
    expect(await ids({ tenantId: tenantB, vector: [1, 0, 0] })).toEqual([]);
  });

  it('lists only live rows with text and no vector yet, per tenant, by id', async () => {
    await insert('a-ready', tenantA, [1, 0, 0]);
    await insert('b-pending', tenantA, null);
    await insert('c-pending', tenantA, null);
    await insert('d-trashed', tenantA, null, { deleted: true });
    await insert('e-theirs', tenantB, null);
    await adminClient.$executeRawUnsafe(
      `INSERT INTO "${table}" ("id", "tenantId", "ownerId", "body") VALUES ('f-blank', $1, 'o', '  ')`,
      tenantA,
    );

    expect(await store.missingEmbeddings(target, tenantA, null, 10)).toEqual([
      'b-pending',
      'c-pending',
    ]);
    expect(
      await store.missingEmbeddings(target, tenantA, 'b-pending', 10),
    ).toEqual(['c-pending']);
    expect(await store.missingEmbeddings(target, tenantA, null, 1)).toEqual([
      'b-pending',
    ]);
  });

  describe('under row-level security as a role that cannot bypass it', () => {
    const restricted = () =>
      new VectorStore(restrictedClient as unknown as TenantScopedPrismaClient);

    it('reads and writes because it sets the tenant for the transaction', async () => {
      await insert('a', tenantA, null);
      await insert('b', tenantB, null);

      await restricted().write(target, 'a', tenantA, [1, 0, 0]);
      await restricted().write(target, 'b', tenantA, [1, 0, 0]);

      expect(await restricted().readSource(target, 'a', tenantA)).toBe(
        'body of a',
      );
      expect(await restricted().readSource(target, 'b', tenantA)).toBeNull();
      const rows = await restricted().similar(target, query());
      expect(rows.map((row) => row.id)).toEqual(['a']);
      expect(
        await adminClient.$queryRawUnsafe<{ id: string }[]>(
          `SELECT "id" FROM "${table}" WHERE "embedding" IS NOT NULL`,
        ),
      ).toEqual([{ id: 'a' }]);
    });

    it('sees nothing when asked for a tenant the session was not set to', async () => {
      await insert('b', tenantB, [1, 0, 0]);

      const rows = await restricted().similar(
        target,
        query({ tenantId: tenantB }),
      );

      expect(rows.map((row) => row.id)).toEqual(['b']);
      expect(
        await restrictedClient.$queryRawUnsafe(`SELECT "id" FROM "${table}"`),
      ).toEqual([]);
    });
  });
});
