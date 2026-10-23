import type {
  AuthenticatedSocket,
  AuthenticatedUser,
  AuthProvider,
} from '@heryjs/core/auth';
import { PeerGateway } from './peer.gateway';
import { PeerRoomPresenceService } from './peer-room-presence.service';
import { PeerTurnCredentialsService } from './peer-turn-credentials.service';

function member(id: string, tenantId: string): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    tenantId,
    teamIds: [],
    currentTeamId: null,
    role: 'member',
    impersonatedBy: null,
  };
}

function socketFor(id: string, user: AuthenticatedUser) {
  return {
    id,
    handshake: { auth: {} },
    data: { user },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  } as unknown as AuthenticatedSocket & { join: jest.Mock; to: jest.Mock };
}

describe('tenant isolation', () => {
  function gatewayWith() {
    const gateway = new PeerGateway(
      new PeerRoomPresenceService(),
      new PeerTurnCredentialsService(),
      {} as AuthProvider,
    );
    const emit = jest.fn();
    const server = { to: jest.fn().mockReturnValue({ emit }) };
    Reflect.set(gateway, 'server', server);

    return { gateway, server };
  }

  it('never shows tenant A the participants of the same room name in tenant B', async () => {
    const { gateway } = gatewayWith();
    await gateway.joinRoom(socketFor('socket-b', member('bob', 'tenant-b')), {
      room: 'standup',
    });

    const joined = await gateway.joinRoom(
      socketFor('socket-a', member('alice', 'tenant-a')),
      { room: 'standup' },
    );

    expect(joined.participants).toEqual([
      { socketId: 'socket-a', userId: 'alice' },
    ]);
  });

  it('never puts sockets of two tenants in the same socket.io room', async () => {
    const { gateway } = gatewayWith();
    const bob = socketFor('socket-b', member('bob', 'tenant-b'));
    const alice = socketFor('socket-a', member('alice', 'tenant-a'));

    await gateway.joinRoom(bob, { room: 'standup' });
    await gateway.joinRoom(alice, { room: 'standup' });

    const [aliceRoom] = alice.join.mock.calls[0] as [string];
    const [bobRoom] = bob.join.mock.calls[0] as [string];

    expect(aliceRoom).not.toBe(bobRoom);
  });

  it('refuses to relay signalling from tenant A to a socket of tenant B', async () => {
    const { gateway, server } = gatewayWith();
    await gateway.joinRoom(socketFor('socket-b', member('bob', 'tenant-b')), {
      room: 'standup',
    });
    const alice = socketFor('socket-a', member('alice', 'tenant-a'));
    await gateway.joinRoom(alice, { room: 'standup' });
    server.to.mockClear();

    gateway.offer(alice, {
      room: 'standup',
      to: 'socket-b',
      payload: { sdp: 'x' },
    });

    expect(server.to).not.toHaveBeenCalledWith('socket-b');
  });
});
