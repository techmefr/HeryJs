import {
  resolveCapability,
  resolveCollectionCapability,
} from '#technical/capabilities/resolve-capability';
import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { ChangeFeedHub } from './change-feed.hub';
import { ChangeFeedRegistry } from './change-feed.registry';
import type {
  ChangeEnvelope,
  ChangeFeedMessage,
  ChangeFeedSubscriber,
} from './change-feed.types';
import { InMemoryChangeFeedBackend } from './in-memory-change-feed.backend';

interface PostRecord {
  ownerId: string;
  teamId?: string;
  title: string;
}

function subscriberOf(
  id: string,
  tenantId = 'tenant-1',
  role: string | null = null,
): ChangeFeedSubscriber {
  const subject: CapabilitySubject = {
    id,
    teamIds: [],
    currentTeamId: null,
    role,
  };

  return { tenantId, userId: id, subject };
}

function changeEnvelope(
  overrides: Partial<ChangeEnvelope> = {},
): ChangeEnvelope {
  return {
    type: 'change',
    id: 'message-1',
    tenantId: 'tenant-1',
    channel: 'posts',
    model: 'Post',
    kind: 'created',
    recordId: 'post-1',
    at: '2026-10-21T10:00:00.000Z',
    changedFields: [],
    record: { id: 'post-1', title: 'hello' },
    visibility: { ownerId: 'alice' },
    ...overrides,
  };
}

describe('ChangeFeedHub', () => {
  let backend: InMemoryChangeFeedBackend;
  let registry: ChangeFeedRegistry;
  let hub: ChangeFeedHub;

  beforeEach(() => {
    backend = new InMemoryChangeFeedBackend();
    registry = new ChangeFeedRegistry();
    registry.register<PostRecord>({
      model: 'Post',
      channel: 'posts',
      canViewAny: (subject) => resolveCollectionCapability('own', subject),
      canView: (subject, record) =>
        record ? resolveCapability('own', subject, record) : { allowed: false },
      canBroadcast: (subject) =>
        subject.role === 'editor'
          ? { allowed: true, scope: 'all' }
          : { allowed: false },
      load: () => Promise.resolve(null),
      toView: (record) => ({ title: record.title }),
    });
    registry.register<PostRecord>({
      model: 'Secret',
      channel: 'secrets',
      canViewAny: (subject) => resolveCollectionCapability('none', subject),
      canView: () => ({ allowed: false }),
      load: () => Promise.resolve(null),
      toView: () => ({}),
    });
    hub = new ChangeFeedHub(registry, backend);
  });

  function connect(subscriber: ChangeFeedSubscriber) {
    const received: ChangeFeedMessage[] = [];
    const session = hub.open(subscriber, (message) => received.push(message));

    return { session, received };
  }

  describe('subscribing', () => {
    it('subscribes to a channel the caller may list and reports the rest as denied', async () => {
      const { session } = connect(subscriberOf('alice'));

      const result = await session.subscribe(['posts', 'secrets', 'nope']);

      expect(result.subscribed).toEqual(['posts']);
      expect(result.denied).toEqual([
        { channel: 'secrets', reason: 'forbidden' },
        { channel: 'nope', reason: 'unknown-channel' },
      ]);
    });

    it('opens no backend subscription when every channel is refused', async () => {
      const { session } = connect(subscriberOf('alice'));

      await session.subscribe(['secrets']);

      expect(backend.listenerCount('tenant-1')).toBe(0);
    });

    it('ignores a malformed channel list instead of throwing', async () => {
      const { session } = connect(subscriberOf('alice'));

      expect(await session.subscribe('posts')).toEqual({
        subscribed: [],
        denied: [],
      });
      expect(await session.subscribe([42, null, ''])).toEqual({
        subscribed: [],
        denied: [],
      });
    });

    it('caps how many channels one call can open', async () => {
      const { session } = connect(subscriberOf('alice'));
      const many = Array.from({ length: 200 }, (_, index) => `c${index}`);

      const result = await session.subscribe(many);

      expect(result.denied).toHaveLength(20);
    });
  });

  describe('change delivery', () => {
    it('delivers a row only to the subscriber whose capability lets it read that row', async () => {
      const alice = connect(subscriberOf('alice'));
      const bob = connect(subscriberOf('bob'));
      await alice.session.subscribe(['posts']);
      await bob.session.subscribe(['posts']);

      await backend.publish(changeEnvelope());

      expect(alice.received).toHaveLength(1);
      expect(alice.received[0]).toMatchObject({
        type: 'change',
        channel: 'posts',
        kind: 'created',
        recordId: 'post-1',
        record: { id: 'post-1', title: 'hello' },
      });
      expect(bob.received).toEqual([]);
    });

    it('never puts the routing keys on the message a subscriber receives', async () => {
      const alice = connect(subscriberOf('alice'));
      await alice.session.subscribe(['posts']);

      await backend.publish(changeEnvelope());

      expect(Object.keys(alice.received[0] ?? {})).not.toContain('visibility');
      expect(Object.keys(alice.received[0] ?? {})).not.toContain('tenantId');
    });

    it('delivers a tombstone with no row only to subscribers who could have read it', async () => {
      const alice = connect(subscriberOf('alice'));
      const bob = connect(subscriberOf('bob'));
      await alice.session.subscribe(['posts']);
      await bob.session.subscribe(['posts']);

      await backend.publish(
        changeEnvelope({ kind: 'deleted', record: null, changedFields: [] }),
      );

      expect(alice.received).toEqual([
        expect.objectContaining({ kind: 'deleted', record: null }),
      ]);
      expect(bob.received).toEqual([]);
    });

    it('does not deliver a channel the session never subscribed to', async () => {
      const alice = connect(subscriberOf('alice'));
      await alice.session.subscribe(['posts']);

      await backend.publish(changeEnvelope({ channel: 'secrets' }));

      expect(alice.received).toEqual([]);
    });

    it('never delivers another tenant a change, even one on the same channel', async () => {
      const mine = connect(subscriberOf('alice', 'tenant-1'));
      const theirs = connect(subscriberOf('alice', 'tenant-2'));
      await mine.session.subscribe(['posts']);
      await theirs.session.subscribe(['posts']);

      await backend.publish(changeEnvelope({ tenantId: 'tenant-2' }));

      expect(mine.received).toEqual([]);
      expect(theirs.received).toHaveLength(1);
    });

    it('drops an envelope whose tenant is not the subscriber even if the backend misrouted it', async () => {
      const mine = connect(subscriberOf('alice', 'tenant-1'));
      await mine.session.subscribe(['posts']);
      const [listener] = [
        ...(
          backend as unknown as {
            listeners: Map<string, Set<(envelope: ChangeEnvelope) => void>>;
          }
        ).listeners.get('tenant-1')!,
      ];

      listener?.(changeEnvelope({ tenantId: 'tenant-2' }));

      expect(mine.received).toEqual([]);
    });

    it('stops delivering after unsubscribe and after close', async () => {
      const alice = connect(subscriberOf('alice'));
      await alice.session.subscribe(['posts']);
      await alice.session.unsubscribe(['posts']);

      await backend.publish(changeEnvelope());

      expect(alice.received).toEqual([]);
      expect(backend.listenerCount('tenant-1')).toBe(0);

      await alice.session.subscribe(['posts']);
      await alice.session.close();
      await backend.publish(changeEnvelope());

      expect(alice.received).toEqual([]);
      expect(backend.listenerCount('tenant-1')).toBe(0);
    });
  });

  describe('delivery robustness', () => {
    it('keeps delivering to the others when one connection refuses a write', async () => {
      const broken = hub.open(subscriberOf('alice'), () => {
        throw new Error('socket closed');
      });
      const healthy = connect(subscriberOf('alice'));
      await broken.subscribe(['posts']);
      await healthy.session.subscribe(['posts']);

      await expect(backend.publish(changeEnvelope())).resolves.toBeUndefined();

      expect(healthy.received).toHaveLength(1);
    });

    it('attaches once however many subscribe calls race', async () => {
      const { session, received } = connect(subscriberOf('alice'));

      await Promise.all([
        session.subscribe(['posts']),
        session.subscribe(['posts']),
        session.subscribe(['posts']),
      ]);
      await backend.publish(changeEnvelope());

      expect(backend.listenerCount('tenant-1')).toBe(1);
      expect(received).toHaveLength(1);
    });

    it('releases a subscription that finished attaching after the session closed', async () => {
      const { session } = connect(subscriberOf('alice'));

      const pending = session.subscribe(['posts']);
      await session.close();
      await pending;

      expect(backend.listenerCount('tenant-1')).toBe(0);
    });
  });

  describe('presence', () => {
    it('refuses presence on a channel the session did not subscribe to', async () => {
      const { session } = connect(subscriberOf('alice'));

      expect(await session.joinPresence('posts', {})).toEqual({
        ok: false,
        error: 'not-subscribed',
      });
    });

    it('lists members and tells the other subscribers who joined and left', async () => {
      const alice = connect(subscriberOf('alice'));
      const bob = connect(subscriberOf('bob'));
      await alice.session.subscribe(['posts']);
      await bob.session.subscribe(['posts']);

      await alice.session.joinPresence('posts', { cursor: 3 });
      const joined = await bob.session.joinPresence('posts', {});

      expect(
        joined.ok && joined.members.map((member) => member.userId).sort(),
      ).toEqual(['alice', 'bob']);
      expect(alice.received).toHaveLength(1);
      expect(alice.received[0]).toMatchObject({
        type: 'presence',
        event: 'joined',
        member: { userId: 'bob' },
      });

      await bob.session.leavePresence('posts');

      expect(alice.received.at(-1)).toMatchObject({
        type: 'presence',
        event: 'left',
        member: { userId: 'bob' },
      });
    });

    it('announces a join once however many times the same session re-joins', async () => {
      const alice = connect(subscriberOf('alice'));
      await alice.session.subscribe(['posts']);

      await alice.session.joinPresence('posts', { a: 1 });
      await alice.session.joinPresence('posts', { a: 2 });

      expect(
        backend.published.filter(
          (envelope) =>
            envelope.type === 'presence' && envelope.event === 'joined',
        ),
      ).toHaveLength(1);
    });

    it('removes a closed session from presence and announces it', async () => {
      const alice = connect(subscriberOf('alice'));
      const bob = connect(subscriberOf('bob'));
      await alice.session.subscribe(['posts']);
      await bob.session.subscribe(['posts']);
      await bob.session.joinPresence('posts', {});

      await bob.session.close();

      expect(await backend.listPresence('tenant-1', 'posts')).toEqual([]);
      expect(alice.received.at(-1)).toMatchObject({ event: 'left' });
    });

    it('keeps presence tenant-isolated', async () => {
      const mine = connect(subscriberOf('alice', 'tenant-1'));
      const theirs = connect(subscriberOf('mallory', 'tenant-2'));
      await mine.session.subscribe(['posts']);
      await theirs.session.subscribe(['posts']);

      await mine.session.joinPresence('posts', {});
      const result = await theirs.session.joinPresence('posts', {});

      expect(
        result.ok && result.members.map((member) => member.userId),
      ).toEqual(['mallory']);
      expect(theirs.received).toEqual([]);
    });

    it('refuses a state larger than the cap', async () => {
      const { session } = connect(subscriberOf('alice'));
      await session.subscribe(['posts']);

      expect(
        await session.joinPresence('posts', { blob: 'x'.repeat(5_000) }),
      ).toEqual({ ok: false, error: 'payload-too-large' });
    });
  });

  describe('broadcast', () => {
    it('relays a client message to the other subscribers when the capability allows it', async () => {
      const alice = connect(subscriberOf('alice', 'tenant-1', 'editor'));
      const bob = connect(subscriberOf('bob'));
      await alice.session.subscribe(['posts']);
      await bob.session.subscribe(['posts']);

      expect(
        await alice.session.broadcast('posts', 'cursor.moved', { x: 1 }),
      ).toEqual({ ok: true });

      expect(bob.received).toEqual([
        {
          type: 'broadcast',
          channel: 'posts',
          event: 'cursor.moved',
          payload: { x: 1 },
          from: 'alice',
        },
      ]);
      expect(alice.received).toEqual([]);
    });

    it('refuses a caller whose capability does not allow it', async () => {
      const bob = connect(subscriberOf('bob'));
      await bob.session.subscribe(['posts']);

      expect(await bob.session.broadcast('posts', 'x', {})).toEqual({
        ok: false,
        error: 'forbidden',
      });
    });

    it('refuses a channel the session is not subscribed to', async () => {
      const alice = connect(subscriberOf('alice', 'tenant-1', 'editor'));

      expect(await alice.session.broadcast('posts', 'x', {})).toEqual({
        ok: false,
        error: 'not-subscribed',
      });
    });

    it('refuses a bad event name and an oversized payload', async () => {
      const alice = connect(subscriberOf('alice', 'tenant-1', 'editor'));
      await alice.session.subscribe(['posts']);

      expect(await alice.session.broadcast('posts', '../etc', {})).toEqual({
        ok: false,
        error: 'invalid-event',
      });
      expect(
        await alice.session.broadcast('posts', 'big', {
          blob: 'x'.repeat(9_000),
        }),
      ).toEqual({ ok: false, error: 'payload-too-large' });
    });

    it('stays inside the tenant', async () => {
      const alice = connect(subscriberOf('alice', 'tenant-1', 'editor'));
      const other = connect(subscriberOf('zed', 'tenant-2', 'editor'));
      await alice.session.subscribe(['posts']);
      await other.session.subscribe(['posts']);

      await alice.session.broadcast('posts', 'hello', {});

      expect(other.received).toEqual([]);
    });
  });
});
