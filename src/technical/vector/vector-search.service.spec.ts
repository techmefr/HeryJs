import { env } from '#technical/config/env';
import { EmbeddingDimensionMismatchException } from '#technical/embeddings/embedding-dimension-mismatch.exception';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { VectorSearchService } from './vector-search.service';
import type { SimilarRow, VectorStore } from './vector-store';
import type { VectorTarget } from './vector-target';
import { VectorTargetRegistry } from './vector-target.registry';

const target: VectorTarget = {
  table: 'Note',
  column: 'embedding',
  sourceColumn: 'body',
  dimensions: 3,
  softDeletes: true,
};

function build(rows: SimilarRow[] = [], vector: number[] = [1, 0, 0]) {
  const store = { similar: jest.fn().mockResolvedValue(rows) };
  const embedder = {
    dimensions: 3,
    embedOne: jest.fn().mockResolvedValue(vector),
  };
  const service = new VectorSearchService(
    store as unknown as VectorStore,
    new VectorTargetRegistry(),
    embedder,
  );

  return { service, store, embedder };
}

function rows(count: number): SimilarRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    distance: index / 100,
  }));
}

describe('VectorSearchService', () => {
  describe('similar', () => {
    it('embeds the text and ranks inside the tenant, scope and trash state', async () => {
      const { service, store, embedder } = build(rows(2));

      const matches = await runInTenant('tenant-a', () =>
        service.similar(target, {
          text: 'squat rack',
          scope: { ownerId: 'user-1' },
          trash: 'exclude',
        }),
      );

      expect(embedder.embedOne).toHaveBeenCalledWith('squat rack');
      expect(store.similar).toHaveBeenCalledWith(
        target,
        expect.objectContaining({
          vector: [1, 0, 0],
          metric: 'cosine',
          tenantId: 'tenant-a',
          scope: { kind: 'owner', ownerId: 'user-1' },
          trash: 'exclude',
        }),
      );
      expect(matches).toMatchObject({
        ids: ['row-0', 'row-1'],
        truncated: false,
        metric: 'cosine',
      });
    });

    it('asks for one row past the cap so it can say the cap was reached', async () => {
      const limit = env.VECTOR_SEARCH_LIMIT;
      const { service, store } = build(rows(limit + 1));

      const matches = await runInTenant('tenant-a', () =>
        service.similar(target, { text: 'q', scope: {}, trash: 'exclude' }),
      );

      expect(store.similar).toHaveBeenCalledWith(
        target,
        expect.objectContaining({ limit: limit + 1 }),
      );
      expect(matches.ids).toHaveLength(limit);
      expect(matches.truncated).toBe(true);
      expect(matches.limit).toBe(limit);
    });

    it('honours the metric the caller asked for', async () => {
      const { service, store } = build();

      await runInTenant('tenant-a', () =>
        service.similar(target, {
          text: 'q',
          scope: {},
          trash: 'exclude',
          metric: 'l2',
        }),
      );

      expect(store.similar).toHaveBeenCalledWith(
        target,
        expect.objectContaining({ metric: 'l2' }),
      );
    });

    it('refuses a query vector that does not fit the column before touching the database', async () => {
      const { service, store } = build([], [1, 0]);

      await expect(
        runInTenant('tenant-a', () =>
          service.similar(target, { text: 'q', scope: {}, trash: 'exclude' }),
        ),
      ).rejects.toThrow(EmbeddingDimensionMismatchException);
      expect(store.similar).not.toHaveBeenCalled();
    });
  });
});

describe('VectorSearchService.track', () => {
  it('makes a target known to the registry the outbox handler reads', () => {
    const registry = new VectorTargetRegistry();
    const service = new VectorSearchService(
      {} as unknown as VectorStore,
      registry,
      { dimensions: 3, embedOne: jest.fn() },
    );

    service.track(target);

    expect(registry.find('Note')).toBe(target);
    expect(registry.find('Other')).toBeNull();
  });
});
