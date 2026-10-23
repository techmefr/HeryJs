import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#kernel/public/env';
import { type OutboxDelivery, OutboxModule } from '#kernel/public/jobs';
import {
  OUTBOX_RELAY_OPTIONS,
  VectorEmbeddingHandler,
  VectorModule,
  VectorSearchService,
  type VectorTarget,
} from '#kernel/public/testing';
import { runInTenant } from '#kernel/public/tenancy';
import { DEFAULT_EMBEDDING_DIMENSIONS } from './embeddings.env';
import { EmbeddingsModule } from './embeddings.module';

describe('tenant isolation', () => {
  const suffix = randomUUID().replace(/-/g, '');
  const table = `EmbeddingIsolation_${suffix}`;
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

  function insert(id: string, tenantId: string, body: string): Promise<number> {
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

  function delivered(id: string, tenantId: string): OutboxDelivery {
    return {
      id: randomUUID(),
      name: 'model.created',
      payload: {
        model: table,
        kind: 'created',
        recordId: id,
        tenantId,
        changedFields: [],
      },
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

  it('never returns the rows of tenant B to a similarity search of tenant A', async () => {
    await insert('mine', tenantA, 'banana bread recipe');
    await insert('theirs', tenantB, 'barbell back squat form');
    await handler.handle(delivered('mine', tenantA));
    await handler.handle(delivered('theirs', tenantB));

    const fromA = await runInTenant(tenantA, () =>
      vectors.similar(target, {
        text: 'barbell back squat form',
        scope: {},
        trash: 'absent',
      }),
    );

    expect(fromA.ids).toEqual(['mine']);
  });

  it('does not embed a row of tenant B for a delivery claiming tenant A', async () => {
    await insert('foreign', tenantB, 'chocolate cake');

    await handler.handle(delivered('foreign', tenantA));

    expect(await isEmbedded('foreign')).toBe(false);
  });
});
