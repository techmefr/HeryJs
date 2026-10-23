import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#kernel/config/env';
import { OutboxModule } from '#kernel/outbox/outbox.module';
import { OUTBOX_RELAY_OPTIONS } from '#kernel/outbox/outbox.runner';
import type { OutboxDelivery } from '#kernel/outbox/outbox.types';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';
import { VectorEmbeddingHandler } from '#kernel/vector/vector-embedding.handler';
import { VectorModule } from '#kernel/vector/vector.module';
import { VectorSearchService } from '#kernel/vector/vector-search.service';
import type { VectorTarget } from '#kernel/vector/vector-target';
import { DEFAULT_EMBEDDING_DIMENSIONS } from './embeddings.env';
import { EmbeddingsModule } from './embeddings.module';

describe('embedding pipeline (outbox handler, fake driver, pgvector)', () => {
  const suffix = randomUUID().replace(/-/g, '');
  const table = `EmbeddingPipeline_${suffix}`;
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const target: VectorTarget = {
    table,
    column: 'embedding',
    sourceColumn: 'body',
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    softDeletes: false,
  };

  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    }),
  });
  let moduleRef: TestingModule;
  let vectors: VectorSearchService;
  let handler: VectorEmbeddingHandler;

  function insert(
    id: string,
    tenantId: string,
    body: string | null,
  ): Promise<number> {
    return admin.$executeRawUnsafe(
      `INSERT INTO "${table}" ("id", "tenantId", "ownerId", "body") VALUES ($1, $2, 'owner-1', $3)`,
      id,
      tenantId,
      body,
    );
  }

  async function isEmbedded(id: string): Promise<boolean> {
    const rows = await admin.$queryRawUnsafe<{ embedded: boolean }[]>(
      `SELECT "embedding" IS NOT NULL AS "embedded" FROM "${table}" WHERE "id" = $1`,
      id,
    );

    return rows[0]?.embedded === true;
  }

  function delivered(
    id: string,
    tenantId: string,
    kind: 'created' | 'updated',
    changedFields: string[] = [],
  ): OutboxDelivery {
    return {
      id: randomUUID(),
      name: `model.${kind}`,
      payload: { model: table, kind, recordId: id, tenantId, changedFields },
      tenantId,
      attempt: 1,
      createdAt: new Date(),
    };
  }

  beforeAll(async () => {
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${table}" (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "body" TEXT,
        "embedding" vector(${DEFAULT_EMBEDDING_DIMENSIONS})
      )
    `);

    moduleRef = await Test.createTestingModule({
      imports: [EmbeddingsModule, VectorModule, OutboxModule],
    })
      .overrideProvider(OUTBOX_RELAY_OPTIONS)
      .useValue({ isEnabled: false, intervalMs: 1000 })
      .compile();
    await moduleRef.init();
    vectors = moduleRef.get(VectorSearchService);
    handler = moduleRef.get(VectorEmbeddingHandler);
    vectors.track(target);
  });

  afterAll(async () => {
    await moduleRef.close();
    await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
    await admin.$disconnect();
  });

  async function seedNeighbours(tenantId: string): Promise<{
    squat: string;
    bread: string;
  }> {
    const squat = `squat-${tenantId}`;
    const bread = `bread-${tenantId}`;
    await insert(squat, tenantId, 'barbell back squat form');
    await insert(bread, tenantId, 'banana bread recipe');
    await handler.handle(delivered(squat, tenantId, 'created'));
    await handler.handle(delivered(bread, tenantId, 'created'));

    return { squat, bread };
  }

  it('embeds a created record, then finds it by the text it was written with', async () => {
    const tenantId = `tenant-own-${randomUUID()}`;
    const { squat, bread } = await seedNeighbours(tenantId);

    const matches = await runInTenant(tenantId, () =>
      vectors.similar(target, {
        text: 'back squat',
        scope: {},
        trash: 'absent',
      }),
    );

    expect(matches.ids).toEqual([squat, bread]);
    expect(matches.truncated).toBe(false);
  });

  it('re-embeds when the source changed and leaves the vector when it did not', async () => {
    const tenantId = `tenant-own-${randomUUID()}`;
    const note = `note-${tenantId}`;
    await seedNeighbours(tenantId);
    await insert(note, tenantId, 'first text');
    await handler.handle(delivered(note, tenantId, 'created'));
    await admin.$executeRawUnsafe(
      `UPDATE "${table}" SET "body" = 'chocolate cake' WHERE "id" = $1`,
      note,
    );

    await handler.handle(delivered(note, tenantId, 'updated', ['title']));
    const stale = await runInTenant(tenantId, () =>
      vectors.similar(target, {
        text: 'chocolate cake',
        scope: {},
        trash: 'absent',
      }),
    );
    await handler.handle(delivered(note, tenantId, 'updated', ['body']));
    const fresh = await runInTenant(tenantId, () =>
      vectors.similar(target, {
        text: 'chocolate cake',
        scope: {},
        trash: 'absent',
      }),
    );

    expect(stale.ids[0]).not.toBe(note);
    expect(fresh.ids[0]).toBe(note);
  });

  it('never ranks another tenant row, even for the exact text', async () => {
    await insert('theirs', tenantB, 'barbell back squat form');
    await handler.handle(delivered('theirs', tenantB, 'created'));

    const matches = await runInTenant(tenantA, () =>
      vectors.similar(target, {
        text: 'barbell back squat form',
        scope: {},
        trash: 'absent',
      }),
    );

    expect(matches.ids).not.toContain('theirs');
  });

  it('clears the embedding when the source text is emptied', async () => {
    await insert('emptied', tenantA, 'something to embed');
    await handler.handle(delivered('emptied', tenantA, 'created'));
    expect(await isEmbedded('emptied')).toBe(true);

    await admin.$executeRawUnsafe(
      `UPDATE "${table}" SET "body" = NULL WHERE "id" = 'emptied'`,
    );
    await handler.handle(delivered('emptied', tenantA, 'updated', ['body']));

    expect(await isEmbedded('emptied')).toBe(false);
  });
});
