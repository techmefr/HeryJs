import { ChangeFeedHub } from '#technical/change-feed/change-feed.hub';
import { ChangeFeedRegistry } from '#technical/change-feed/change-feed.registry';
import { InMemoryChangeFeedBackend } from '#technical/change-feed/in-memory-change-feed.backend';
import type {
  AuthenticatedUser,
  AuthProvider,
} from '#technical/auth/auth.types';
import { ChangeFeedGateway } from './change-feed.gateway';
import type { LiveSocket } from './live-auth.guard';

function user(
  id: string,
  tenantId = 'tenant-1',
  role: string | null = null,
): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.test`,
    tenantId,
    teamIds: [],
    currentTeamId: null,
    role,
    impersonatedBy: null,
  };
}

interface FakeSocket {
  socket: LiveSocket;
  emitted: { event: string; payload: unknown }[];
  disconnected: boolean;
}

function fakeSocket(id: string, token: string | null): FakeSocket {
  const fake: FakeSocket = {
    emitted: [],
    disconnected: false,
    socket: {
      id,
      data: {},
      handshake: { auth: token === null ? {} : { token } },
      emit: (event: string, payload: unknown) => {
        fake.emitted.push({ event, payload });
        return true;
      },
      disconnect: () => {
        fake.disconnected = true;
      },
    } as unknown as LiveSocket,
  };

  return fake;
}

describe('ChangeFeedGateway', () => {
  let backend: InMemoryChangeFeedBackend;
  let gateway: ChangeFeedGateway;

  const sessions: Record<string, AuthenticatedUser> = {
    'alice-token': user('alice', 'tenant-1', 'editor'),
    'bob-token': user('bob'),
    'mallory-token': user('mallory', 'tenant-2', 'editor'),
  };

  beforeEach(() => {
    backend = new InMemoryChangeFeedBackend();
    const registry = new ChangeFeedRegistry();
    registry.register<{ ownerId: string }>({
      model: 'Post',
      channel: 'posts',
      canViewAny: () => ({ allowed: true, scope: 'own' }),
      canView: (subject, record) => ({
        allowed: record !== undefined && record.ownerId === subject.id,
      }),
      canBroadcast: (subject) => ({ allowed: subject.role === 'editor' }),
      load: () => Promise.resolve(null),
      toView: () => ({}),
    });
    const authProvider = {
      validateSession: (token: string) =>
        Promise.resolve(sessions[token] ?? null),
    } as unknown as AuthProvider;
    gateway = new ChangeFeedGateway(
      new ChangeFeedHub(registry, backend),
      authProvider,
    );
  });

  async function connect(id: string, token: string | null) {
    const fake = fakeSocket(id, token);
    await gateway.handleConnection(fake.socket);

    return fake;
  }

  function publishPost(ownerId: string, tenantId = 'tenant-1') {
    return backend.publish({
      type: 'change',
      id: 'message-1',
      tenantId,
      channel: 'posts',
      model: 'Post',
      kind: 'updated',
      recordId: 'post-1',
      at: '2026-10-21T10:00:00.000Z',
      changedFields: ['title'],
      record: { id: 'post-1', title: 'hello' },
      visibility: { ownerId },
    });
  }

  it('disconnects a socket with no valid session', async () => {
    const anonymous = await connect('s1', null);
    const forged = await connect('s2', 'nope');

    expect(anonymous.disconnected).toBe(true);
    expect(forged.disconnected).toBe(true);
  });

  it('answers a subscribe with what was granted and what was refused', async () => {
    const alice = await connect('s1', 'alice-token');

    expect(
      await gateway.subscribe(alice.socket, { channels: ['posts', 'nope'] }),
    ).toEqual({
      subscribed: ['posts'],
      denied: [{ channel: 'nope', reason: 'unknown-channel' }],
    });
  });

  it('emits a change only to the socket whose user may read the row, in its own tenant', async () => {
    const alice = await connect('s1', 'alice-token');
    const bob = await connect('s2', 'bob-token');
    const mallory = await connect('s3', 'mallory-token');
    for (const fake of [alice, bob, mallory]) {
      await gateway.subscribe(fake.socket, { channels: ['posts'] });
    }

    await publishPost('alice');

    expect(alice.emitted).toHaveLength(1);
    expect(alice.emitted[0]).toMatchObject({
      event: 'change',
      payload: { recordId: 'post-1', record: { id: 'post-1', title: 'hello' } },
    });
    expect(bob.emitted).toEqual([]);
    expect(mallory.emitted).toEqual([]);
  });

  it('answers a socket that never subscribed with not-subscribed rather than throwing', async () => {
    const stranger = fakeSocket('ghost', null);

    expect(
      await gateway.subscribe(stranger.socket, { channels: ['posts'] }),
    ).toEqual({
      ok: false,
      error: 'not-subscribed',
    });
    expect(
      await gateway.unsubscribe(stranger.socket, { channels: ['posts'] }),
    ).toEqual({
      unsubscribed: [],
    });
  });

  it('runs presence over the socket and tells the others when it ends on disconnect', async () => {
    const alice = await connect('s1', 'alice-token');
    const bob = await connect('s2', 'bob-token');
    await gateway.subscribe(alice.socket, { channels: ['posts'] });
    await gateway.subscribe(bob.socket, { channels: ['posts'] });

    await gateway.joinPresence(alice.socket, {
      channel: 'posts',
      state: { typing: true },
    });
    const joined = await gateway.joinPresence(bob.socket, {
      channel: 'posts',
      state: {},
    });

    expect(joined).toMatchObject({ ok: true });
    expect(alice.emitted.at(-1)).toMatchObject({
      event: 'presence',
      payload: { event: 'joined', member: { userId: 'bob' } },
    });

    await gateway.handleDisconnect(bob.socket);

    expect(alice.emitted.at(-1)).toMatchObject({
      event: 'presence',
      payload: { event: 'left', member: { userId: 'bob' } },
    });
    expect(await backend.listPresence('tenant-1', 'posts')).toHaveLength(1);
  });

  it('leaves presence on request', async () => {
    const alice = await connect('s1', 'alice-token');
    await gateway.subscribe(alice.socket, { channels: ['posts'] });
    await gateway.joinPresence(alice.socket, { channel: 'posts', state: {} });

    expect(
      await gateway.leavePresence(alice.socket, { channel: 'posts' }),
    ).toEqual({ ok: true });
    expect(await backend.listPresence('tenant-1', 'posts')).toEqual([]);
  });

  it('relays a broadcast only for a user the capability allows, and not back to the sender', async () => {
    const alice = await connect('s1', 'alice-token');
    const bob = await connect('s2', 'bob-token');
    await gateway.subscribe(alice.socket, { channels: ['posts'] });
    await gateway.subscribe(bob.socket, { channels: ['posts'] });

    expect(
      await gateway.broadcast(bob.socket, {
        channel: 'posts',
        event: 'x',
        payload: {},
      }),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(
      await gateway.broadcast(alice.socket, {
        channel: 'posts',
        event: 'cursor',
        payload: { x: 1 },
      }),
    ).toEqual({ ok: true });

    expect(bob.emitted).toHaveLength(1);
    expect(bob.emitted[0]).toMatchObject({
      event: 'broadcast',
      payload: { from: 'alice' },
    });
    expect(alice.emitted).toEqual([]);
  });

  it('stops emitting to a socket that unsubscribed or disconnected', async () => {
    const alice = await connect('s1', 'alice-token');
    await gateway.subscribe(alice.socket, { channels: ['posts'] });

    expect(
      await gateway.unsubscribe(alice.socket, { channels: ['posts'] }),
    ).toEqual({
      unsubscribed: ['posts'],
    });
    await publishPost('alice');
    expect(alice.emitted).toEqual([]);

    await gateway.subscribe(alice.socket, { channels: ['posts'] });
    await gateway.handleDisconnect(alice.socket);
    await publishPost('alice');
    expect(alice.emitted).toEqual([]);
    expect(backend.listenerCount('tenant-1')).toBe(0);
  });
});
