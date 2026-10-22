import { ChangeFeedHub } from '#technical/change-feed/change-feed.hub';
import { ChangeFeedRegistry } from '#technical/change-feed/change-feed.registry';
import { InMemoryChangeFeedBackend } from '#technical/change-feed/in-memory-change-feed.backend';
import type {
  AuthenticatedUser,
  AuthProvider,
} from '#technical/auth/auth.types';
import { ChangeFeedGateway } from './change-feed.gateway';
import type { LiveSocket } from './live-auth.guard';

function user(id: string, tenantId: string): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.test`,
    tenantId,
    teamIds: [],
    currentTeamId: null,
    role: 'editor',
    impersonatedBy: null,
  };
}

interface FakeSocket {
  socket: LiveSocket;
  emitted: { event: string; payload: unknown }[];
}

function fakeSocket(id: string, token: string): FakeSocket {
  const fake: FakeSocket = {
    emitted: [],
    socket: {
      id,
      data: {},
      handshake: { auth: { token } },
      emit: (event: string, payload: unknown) => {
        fake.emitted.push({ event, payload });
        return true;
      },
      disconnect: () => undefined,
    } as unknown as LiveSocket,
  };

  return fake;
}

describe('tenant isolation', () => {
  let backend: InMemoryChangeFeedBackend;
  let gateway: ChangeFeedGateway;

  const sessions: Record<string, AuthenticatedUser> = {
    'a-token': user('shared-id', 'tenant-a'),
    'b-token': user('shared-id', 'tenant-b'),
  };

  beforeEach(() => {
    backend = new InMemoryChangeFeedBackend();
    const registry = new ChangeFeedRegistry();
    registry.register<{ ownerId: string }>({
      model: 'Post',
      channel: 'posts',
      canViewAny: () => ({ allowed: true, scope: 'all' }),
      canView: () => ({ allowed: true }),
      canBroadcast: () => ({ allowed: true }),
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

  async function subscribed(id: string, token: string): Promise<FakeSocket> {
    const fake = fakeSocket(id, token);
    await gateway.handleConnection(fake.socket);
    await gateway.subscribe(fake.socket, { channels: ['posts'] });

    return fake;
  }

  it('never emits a change of tenant B to a subscriber of tenant A', async () => {
    const a = await subscribed('s-a', 'a-token');
    const b = await subscribed('s-b', 'b-token');

    await backend.publish({
      type: 'change',
      id: 'message-1',
      tenantId: 'tenant-b',
      channel: 'posts',
      model: 'Post',
      kind: 'updated',
      recordId: 'post-1',
      at: '2026-10-22T10:00:00.000Z',
      changedFields: ['title'],
      record: { id: 'post-1', title: 'secret of b' },
      visibility: { ownerId: 'shared-id' },
    });

    expect(b.emitted).toHaveLength(1);
    expect(a.emitted).toEqual([]);
  });

  it('keeps presence and broadcasts of tenant B away from tenant A', async () => {
    const a = await subscribed('s-a', 'a-token');
    const b = await subscribed('s-b', 'b-token');
    const bPeer = await subscribed('s-b2', 'b-token');

    await gateway.joinPresence(b.socket, { channel: 'posts', state: {} });
    await gateway.broadcast(b.socket, {
      channel: 'posts',
      event: 'cursor',
      payload: { x: 1 },
    });

    expect(a.emitted).toEqual([]);
    expect(bPeer.emitted.map((entry) => entry.event)).toEqual(
      expect.arrayContaining(['presence', 'broadcast']),
    );
    expect(await backend.listPresence('tenant-a', 'posts')).toEqual([]);
  });
});
