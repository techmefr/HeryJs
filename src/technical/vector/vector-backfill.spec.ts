import { VectorBackfill } from './vector-backfill';
import type { VectorIndexer } from './vector-indexer';
import type { VectorStore } from './vector-store';
import type { VectorTarget } from './vector-target';

const target: VectorTarget = {
  table: 'Note',
  column: 'embedding',
  sourceColumn: 'body',
  dimensions: 3,
  softDeletes: true,
};

function build(missing: Record<string, string[]>) {
  const pending = new Map(
    Object.entries(missing).map(([tenant, ids]) => [tenant, [...ids]]),
  );
  const store = {
    tenantIds: jest.fn().mockResolvedValue([...pending.keys()]),
    missingEmbeddings: jest.fn(
      (
        _target: VectorTarget,
        tenantId: string,
        afterId: string | null,
        limit: number,
      ) =>
        Promise.resolve(
          (pending.get(tenantId) ?? [])
            .filter((id) => afterId === null || id > afterId)
            .slice(0, limit),
        ),
    ),
  };
  const indexer = {
    embedRecord: jest.fn().mockResolvedValue(undefined),
  };

  return {
    store,
    indexer,
    backfill: new VectorBackfill(
      store as unknown as VectorStore,
      indexer as unknown as VectorIndexer,
    ),
  };
}

describe('VectorBackfill', () => {
  it('embeds every missing row of every tenant, in batches', async () => {
    const { backfill, indexer, store } = build({
      a: ['1', '2', '3'],
      b: ['4'],
    });

    const report = await backfill.run(target, { batchSize: 2 });

    expect(report).toMatchObject({ tenants: 2, missing: 4, embedded: 4 });
    expect(indexer.embedRecord).toHaveBeenCalledTimes(4);
    expect(indexer.embedRecord).toHaveBeenCalledWith(target, '4', 'b');
    expect(store.missingEmbeddings).toHaveBeenCalledWith(target, 'a', '2', 2);
  });

  it('only counts on a dry run and embeds nothing', async () => {
    const { backfill, indexer } = build({ a: ['1', '2'] });

    const report = await backfill.run(target, { isDryRun: true });

    expect(report).toMatchObject({ missing: 2, embedded: 0 });
    expect(indexer.embedRecord).not.toHaveBeenCalled();
  });

  it('stays inside one tenant when asked', async () => {
    const { backfill, indexer, store } = build({ a: ['1'], b: ['2'] });

    const report = await backfill.run(target, { tenantId: 'b' });

    expect(store.tenantIds).not.toHaveBeenCalled();
    expect(report.tenants).toBe(1);
    expect(indexer.embedRecord).toHaveBeenCalledTimes(1);
    expect(indexer.embedRecord).toHaveBeenCalledWith(target, '2', 'b');
  });

  it('reports a failing row and carries on with the rest', async () => {
    const { backfill, indexer } = build({ a: ['1', '2', '3'] });
    indexer.embedRecord.mockImplementation((_t: VectorTarget, id: string) =>
      id === '2'
        ? Promise.reject(new Error('provider down'))
        : Promise.resolve(),
    );

    const report = await backfill.run(target, { batchSize: 1 });

    expect(report.embedded).toBe(2);
    expect(report.failed).toEqual([
      { id: '2', tenantId: 'a', reason: 'provider down' },
    ]);
  });

  it('finishes with nothing to do when every row already has a vector', async () => {
    const { backfill } = build({ a: [] });

    await expect(backfill.run(target)).resolves.toMatchObject({
      missing: 0,
      embedded: 0,
    });
  });
});
