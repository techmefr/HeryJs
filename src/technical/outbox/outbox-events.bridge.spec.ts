import { EventDispatcher } from '#technical/events/event-dispatcher.service';
import type { JobsService } from '#technical/jobs/jobs.service';
import { ModelChanged } from './model-changed.event';
import { OutboxEventsBridge } from './outbox-events.bridge';
import { OutboxRegistry } from './outbox.registry';
import type { OutboxDelivery } from './outbox.types';

class InvoicePaid {
  constructor(
    readonly invoiceId: string,
    readonly amount: number,
  ) {}
}

function delivery(
  name: string,
  payload: Record<string, unknown>,
): OutboxDelivery {
  return {
    id: 'message-1',
    name,
    payload,
    tenantId: 'tenant-1',
    attempt: 1,
    createdAt: new Date(),
  };
}

describe('OutboxEventsBridge', () => {
  let events: EventDispatcher;
  let registry: OutboxRegistry;
  let bridge: OutboxEventsBridge;

  beforeEach(() => {
    events = new EventDispatcher({} as unknown as JobsService);
    registry = new OutboxRegistry();
    bridge = new OutboxEventsBridge(registry, events);
    bridge.onModuleInit();
  });

  it('registers itself for model changes and staged events', () => {
    expect(registry.handlersFor('model.created')).toEqual([bridge]);
    expect(registry.handlersFor('event:InvoicePaid')).toEqual([bridge]);
    expect(registry.handlersFor('something.else')).toEqual([]);
  });

  it('dispatches a model change as a ModelChanged event instance', async () => {
    const seen: ModelChanged[] = [];

    events.listen(ModelChanged, {
      name: 'collector',
      handle: (event) => {
        seen.push(event);
      },
    });

    await bridge.handle(
      delivery('model.updated', {
        model: 'BlogPost',
        kind: 'updated',
        recordId: 'post-1',
        tenantId: 'tenant-1',
        changedFields: ['title'],
        userId: 'user-1',
        impersonatedBy: null,
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(ModelChanged);
    expect(seen[0]).toMatchObject({
      model: 'BlogPost',
      kind: 'updated',
      recordId: 'post-1',
      changedFields: ['title'],
      userId: 'user-1',
    });
  });

  it('rebuilds a staged event by class name so the listener gets the same class', async () => {
    const seen: InvoicePaid[] = [];

    events.listen(InvoicePaid, {
      name: 'collector',
      handle: (event) => {
        seen.push(event);
      },
    });

    await bridge.handle(
      delivery('event:InvoicePaid', { invoiceId: 'inv-1', amount: 42 }),
    );

    expect(seen[0]).toBeInstanceOf(InvoicePaid);
    expect(seen[0]).toMatchObject({ invoiceId: 'inv-1', amount: 42 });
  });

  it('treats an event nobody listens to as done', async () => {
    await expect(
      bridge.handle(delivery('event:Unheard', { a: 1 })),
    ).resolves.toBeUndefined();
  });

  it('ignores a model payload it cannot read rather than failing forever', async () => {
    await expect(
      bridge.handle(delivery('model.created', { kind: 'exploded' })),
    ).resolves.toBeUndefined();
  });

  it('lets a failing listener fail the delivery so the relay retries it', async () => {
    events.listen(ModelChanged, {
      name: 'broken',
      handle: () => {
        throw new Error('listener bug');
      },
    });

    await expect(
      bridge.handle(
        delivery('model.created', {
          model: 'Tag',
          kind: 'created',
          recordId: 't1',
          tenantId: 'tenant-1',
        }),
      ),
    ).rejects.toThrow(AggregateError);
  });
});
