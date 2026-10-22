import { resolveCapability } from '#technical/capabilities/resolve-capability';
import type { RecordShare } from '#technical/capabilities/capabilities.types';
import { OUTBOX_SHARED_NAME } from '#technical/outbox/outbox.constants';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import { modelChangeMessages } from '#technical/outbox/outbox-stage';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { ChangeFeedHub } from './change-feed.hub';
import { ChangeFeedPublisher } from './change-feed.publisher';
import { ChangeFeedRegistry } from './change-feed.registry';
import type { ChangeFeedMessage } from './change-feed.types';
import { InMemoryChangeFeedBackend } from './in-memory-change-feed.backend';

interface DocRow {
  id: string;
  ownerId: string;
  title: string;
  shares: RecordShare[];
}

describe('the live feed under per-record sharing', () => {
  let row: DocRow;
  let publisher: ChangeFeedPublisher;
  let hub: ChangeFeedHub;

  beforeEach(() => {
    row = { id: 'doc-1', ownerId: 'alice', title: 'plan', shares: [] };
    const backend = new InMemoryChangeFeedBackend();
    const registry = new ChangeFeedRegistry();
    registry.register<DocRow>({
      model: 'Doc',
      channel: 'docs',
      canViewAny: () => ({ allowed: true }),
      canView: (subject, record) =>
        record
          ? resolveCapability('own', subject, record, 'read')
          : { allowed: false },
      load: (id) => Promise.resolve(id === row.id ? row : null),
      toView: ({ id, title }) => ({ id, title }),
    });
    publisher = new ChangeFeedPublisher(
      new OutboxRegistry(),
      registry,
      backend,
    );
    hub = new ChangeFeedHub(registry, backend);
  });

  async function bobListening(): Promise<ChangeFeedMessage[]> {
    const received: ChangeFeedMessage[] = [];
    const session = hub.open(
      {
        tenantId: 'tenant-1',
        userId: 'bob',
        subject: { id: 'bob', teamIds: [], currentTeamId: null, role: null },
      },
      (message) => received.push(message),
    );
    await session.subscribe(['docs']);

    return received;
  }

  async function shareWritten(operation: 'create' | 'delete'): Promise<void> {
    const messages = await runInTenant('tenant-1', () =>
      Promise.resolve(
        modelChangeMessages({
          model: 'RecordShare',
          operation,
          args: {},
          result: {
            id: 'share-1',
            resource: 'Doc',
            recordId: 'doc-1',
            granteeType: 'user',
            granteeId: 'bob',
            access: 'read',
          },
          tenantId: 'tenant-1',
        }),
      ),
    );

    for (const message of messages) {
      await publisher.handle({
        id: `${message.name}-${operation}`,
        name: message.name,
        payload: message.payload,
        tenantId: message.tenantId,
        attempt: 1,
        createdAt: new Date(),
      });
    }
  }

  it('announces a grant as a change of the shared record, and the reader by share receives it', async () => {
    const received = await bobListening();
    row.shares = [{ granteeType: 'user', granteeId: 'bob', access: 'read' }];

    await shareWritten('create');

    expect(received).toEqual([
      expect.objectContaining({
        type: 'change',
        id: `${OUTBOX_SHARED_NAME}-create`,
        channel: 'docs',
        recordId: 'doc-1',
        record: { id: 'doc-1', title: 'plan' },
      }),
    ]);
  });

  it('stops delivering the record to the former reader once the share is revoked', async () => {
    const received = await bobListening();
    row.shares = [{ granteeType: 'user', granteeId: 'bob', access: 'read' }];
    await shareWritten('create');
    row.shares = [];

    await shareWritten('delete');
    await publisher.handle({
      id: 'later-edit',
      name: 'model.updated',
      payload: {
        model: 'Doc',
        kind: 'updated',
        recordId: 'doc-1',
        tenantId: 'tenant-1',
        changedFields: ['title'],
        ownerId: 'alice',
        teamId: null,
      },
      tenantId: 'tenant-1',
      attempt: 1,
      createdAt: new Date(),
    });

    expect(
      received.map((message) => message.type === 'change' && message.id),
    ).toEqual([`${OUTBOX_SHARED_NAME}-create`]);
  });
});
