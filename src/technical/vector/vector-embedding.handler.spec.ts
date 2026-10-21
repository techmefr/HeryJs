import { EmbeddingDimensionMismatchException } from '#technical/embeddings/embedding-dimension-mismatch.exception';
import type { OutboxDelivery } from '#technical/outbox/outbox.types';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import { VectorEmbeddingHandler } from './vector-embedding.handler';
import type { VectorStore } from './vector-store';
import type { VectorTarget } from './vector-target';
import { VectorTargetRegistry } from './vector-target.registry';

const target: VectorTarget = {
  table: 'Note',
  column: 'embedding',
  sourceColumn: 'body',
  dimensions: 3,
  softDeletes: true,
};

function delivery(payload: Record<string, unknown>): OutboxDelivery {
  return {
    id: 'message-1',
    name: 'model.created',
    payload: {
      model: 'Note',
      kind: 'created',
      recordId: 'note-1',
      tenantId: 'tenant-a',
      changedFields: [],
      ...payload,
    },
    tenantId: 'tenant-a',
    attempt: 1,
    createdAt: new Date(),
  };
}

function build(source: string | null = 'squat rack', vector = [1, 0, 0]) {
  const targets = new VectorTargetRegistry();
  targets.track(target);
  const store = {
    readSource: jest.fn().mockResolvedValue(source),
    write: jest.fn().mockResolvedValue(undefined),
  };
  const embedder = {
    dimensions: 3,
    embedOne: jest.fn().mockResolvedValue(vector),
  };
  const outbox = new OutboxRegistry();
  const handler = new VectorEmbeddingHandler(
    outbox,
    targets,
    store as unknown as VectorStore,
    embedder,
  );

  return { handler, store, embedder, outbox };
}

describe('VectorEmbeddingHandler', () => {
  it('registers for model creations and updates on the outbox', () => {
    const { handler, outbox } = build();

    handler.onModuleInit();

    expect(outbox.handlersFor('model.created')).toEqual([handler]);
    expect(outbox.handlersFor('model.updated')).toEqual([handler]);
    expect(outbox.handlersFor('model.deleted')).toEqual([]);
  });

  it('embeds the text the source column holds when the message is delivered', async () => {
    const { handler, store, embedder } = build();

    await handler.handle(delivery({}));

    expect(store.readSource).toHaveBeenCalledWith(target, 'note-1', 'tenant-a');
    expect(embedder.embedOne).toHaveBeenCalledWith('squat rack');
    expect(store.write).toHaveBeenCalledWith(
      target,
      'note-1',
      'tenant-a',
      [1, 0, 0],
    );
  });

  it('re-embeds an update that touched the source', async () => {
    const { handler, store } = build();

    await handler.handle(
      delivery({ kind: 'updated', changedFields: ['title', 'body'] }),
    );

    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('leaves the vector alone when an update did not touch the source', async () => {
    const { handler, store, embedder } = build();

    await handler.handle(
      delivery({ kind: 'updated', changedFields: ['title'] }),
    );

    expect(embedder.embedOne).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('ignores a model that has no vector target', async () => {
    const { handler, store } = build();

    await handler.handle(delivery({ model: 'Other' }));

    expect(store.readSource).not.toHaveBeenCalled();
  });

  it.each([
    ['no record id', { recordId: null }],
    ['no tenant', { tenantId: null }],
  ])('ignores a message with %s', async (_name, overrides) => {
    const { handler, store } = build();

    await handler.handle(delivery(overrides));

    expect(store.readSource).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])(
    'clears the embedding when the source is %p, so a stale vector stops matching',
    async (source) => {
      const { handler, store, embedder } = build(source);

      await handler.handle(delivery({}));

      expect(embedder.embedOne).not.toHaveBeenCalled();
      expect(store.write).toHaveBeenCalledWith(
        target,
        'note-1',
        'tenant-a',
        null,
      );
    },
  );

  it('fails the delivery on a vector that does not fit the column, so the relay retries and dead-letters it', async () => {
    const { handler, store } = build('squat rack', [1, 0]);

    await expect(handler.handle(delivery({}))).rejects.toThrow(
      EmbeddingDimensionMismatchException,
    );
    expect(store.write).not.toHaveBeenCalled();
  });

  it('fails the delivery when the provider is down', async () => {
    const { handler, embedder } = build();
    embedder.embedOne.mockRejectedValue(new Error('provider down'));

    await expect(handler.handle(delivery({}))).rejects.toThrow('provider down');
  });
});
