import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import type { OutboxDelivery } from '#technical/outbox/outbox.types';
import { ChangeFeedPublisher } from './change-feed.publisher';
import { ChangeFeedRegistry } from './change-feed.registry';
import { InMemoryChangeFeedBackend } from './in-memory-change-feed.backend';

interface PostRow {
  id: string;
  ownerId: string;
  title: string;
  passwordHash: string;
}

const CREATED_AT = new Date('2026-10-21T10:00:00.000Z');

function delivery(
  payload: Record<string, unknown>,
  tenantId: string | null = 'tenant-1',
): OutboxDelivery {
  return {
    id: 'message-1',
    name: 'model.updated',
    payload: {
      model: 'Post',
      kind: 'updated',
      recordId: 'post-1',
      tenantId: 'tenant-1',
      changedFields: ['title'],
      ownerId: 'alice',
      teamId: null,
      userId: 'alice',
      impersonatedBy: null,
      ...payload,
    },
    tenantId,
    attempt: 1,
    createdAt: CREATED_AT,
  };
}

describe('ChangeFeedPublisher', () => {
  let rows: Map<string, PostRow>;
  let backend: InMemoryChangeFeedBackend;
  let outbox: OutboxRegistry;
  let publisher: ChangeFeedPublisher;

  beforeEach(() => {
    rows = new Map([
      [
        'post-1',
        { id: 'post-1', ownerId: 'alice', title: 'hello', passwordHash: 'x' },
      ],
    ]);
    backend = new InMemoryChangeFeedBackend();
    outbox = new OutboxRegistry();
    const resources = new ChangeFeedRegistry();
    resources.register<PostRow>({
      model: 'Post',
      channel: 'posts',
      canViewAny: () => ({ allowed: true }),
      canView: () => ({ allowed: true }),
      load: (id) => Promise.resolve(rows.get(id) ?? null),
      toView: ({ id, title }) => ({ id, title }),
    });
    publisher = new ChangeFeedPublisher(outbox, resources, backend);
    publisher.onModuleInit();
  });

  it('registers on the outbox for every model message', () => {
    expect(outbox.handlersFor('model.created')).toEqual([publisher]);
    expect(outbox.handlersFor('event:Anything')).toEqual([]);
  });

  it('publishes the row through the resource view on the resource channel', async () => {
    await publisher.handle(delivery({}));

    expect(backend.published).toEqual([
      {
        type: 'change',
        id: 'message-1',
        tenantId: 'tenant-1',
        channel: 'posts',
        model: 'Post',
        kind: 'updated',
        recordId: 'post-1',
        at: CREATED_AT.toISOString(),
        changedFields: ['title'],
        record: { id: 'post-1', title: 'hello' },
        visibility: { ownerId: 'alice', teamId: undefined },
      },
    ]);
  });

  it('never publishes a field the view does not expose, nor the name of one', async () => {
    await publisher.handle(
      delivery({ changedFields: ['title', 'passwordHash'] }),
    );

    const [envelope] = backend.published;
    const serialised = JSON.stringify(envelope);

    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('"x"');
    expect(envelope).toMatchObject({ changedFields: ['title'] });
  });

  it('publishes a deletion as a tombstone keyed by the visibility the message carried', async () => {
    await publisher.handle(
      delivery({ kind: 'deleted', ownerId: 'bob', teamId: 'team-9' }),
    );

    expect(backend.published[0]).toMatchObject({
      kind: 'deleted',
      record: null,
      changedFields: [],
      visibility: { ownerId: 'bob', teamId: 'team-9' },
    });
  });

  it('turns an update of a row that no longer loads into a deletion', async () => {
    rows.clear();

    await publisher.handle(delivery({}));

    expect(backend.published[0]).toMatchObject({
      kind: 'deleted',
      record: null,
    });
  });

  it('drops a message it cannot route by capability rather than publish it to everyone', async () => {
    await publisher.handle(delivery({ kind: 'deleted', ownerId: null }));

    expect(backend.published).toEqual([]);
  });

  it('ignores a model nothing registered for the feed', async () => {
    await publisher.handle(delivery({ model: 'Invoice' }));

    expect(backend.published).toEqual([]);
  });

  it('refuses a message whose payload tenant is not the tenant it was staged under', async () => {
    await publisher.handle(delivery({ tenantId: 'tenant-2' }));
    await publisher.handle(delivery({}, null));

    expect(backend.published).toEqual([]);
  });

  it('ignores a message with an unknown kind', async () => {
    await publisher.handle(delivery({ kind: 'exploded' }));

    expect(backend.published).toEqual([]);
  });

  it('lets a failing backend fail the delivery so the outbox retries it', async () => {
    backend.publish = () => Promise.reject(new Error('redis down'));

    await expect(publisher.handle(delivery({}))).rejects.toThrow('redis down');
  });
});
