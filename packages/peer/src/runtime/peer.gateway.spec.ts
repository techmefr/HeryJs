import type { AuthenticatedUser, AuthProvider } from '#kernel/auth/auth.types';
import type { AuthenticatedSocket } from '#kernel/websocket/socket-auth.guard';
import { PeerGateway } from './peer.gateway';
import { PeerRoomPresenceService } from './peer-room-presence.service';
import { PeerTurnCredentialsService } from './peer-turn-credentials.service';
import * as policy from './peer.policy';

const USER: AuthenticatedUser = {
  id: 'user-1',
  email: 'caller@example.com',
  tenantId: 'tenant-1',
  teamIds: [],
  currentTeamId: null,
  role: 'member',
  impersonatedBy: null,
};

function socketFor(id: string, user: AuthenticatedUser) {
  return {
    id,
    handshake: { auth: {} },
    data: { user },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  } as unknown as AuthenticatedSocket & {
    join: jest.Mock;
    leave: jest.Mock;
    to: jest.Mock;
  };
}

function gatewayWith() {
  const presence = new PeerRoomPresenceService();
  const turnCredentials = new PeerTurnCredentialsService();
  const authProvider = {} as AuthProvider;
  const gateway = new PeerGateway(presence, turnCredentials, authProvider);
  // @WebSocketServer() is set by Nest at bootstrap; a plain unit test stands
  // its own stub in for the emit surface the disconnect handler needs.
  const emit = jest.fn();
  const server = { to: jest.fn().mockReturnValue({ emit }) };
  Reflect.set(gateway, 'server', server);
  return { gateway, presence, server, emit };
}

describe('PeerGateway room join and capability gating', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses to join a room when the join policy denies it', async () => {
    jest.spyOn(policy, 'canJoinPeerRoom').mockReturnValue({ allowed: false });
    const { gateway } = gatewayWith();
    const client = socketFor('socket-a', USER);

    await expect(gateway.joinRoom(client, { room: 'room-1' })).resolves.toEqual(
      { error: 'capability denied' },
    );
    expect(client.join).not.toHaveBeenCalled();
  });

  it('joins the socket.io room, tracks presence and notifies the room', async () => {
    const { gateway, presence } = gatewayWith();
    const client = socketFor('socket-a', USER);

    const result = await gateway.joinRoom(client, { room: 'room-1' });

    expect(client.join).toHaveBeenCalledWith('room-1');
    expect(presence.participantsOf('room-1')).toEqual([
      { socketId: 'socket-a', userId: 'user-1' },
    ]);
    expect(client.to).toHaveBeenCalledWith('room-1');
    expect(result).toEqual({
      joined: 'room-1',
      participants: [{ socketId: 'socket-a', userId: 'user-1' }],
    });
  });

  it('hides the participant list when the view policy denies it', async () => {
    jest
      .spyOn(policy, 'canViewPeerRoomParticipants')
      .mockReturnValue({ allowed: false });
    const { gateway } = gatewayWith();
    const client = socketFor('socket-a', USER);

    const result = await gateway.joinRoom(client, { room: 'room-1' });

    expect(result.participants).toEqual([]);
  });
});

describe('PeerGateway leave and disconnect', () => {
  it('removes the participant and tells the room on an explicit leave', () => {
    const { gateway, presence } = gatewayWith();
    const client = socketFor('socket-a', USER);
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-1' });

    const result = gateway.leaveRoom(client, { room: 'room-1' });

    expect(presence.participantsOf('room-1')).toEqual([]);
    expect(client.to).toHaveBeenCalledWith('room-1');
    expect(result).toEqual({ left: 'room-1' });
  });

  // The heart of the issue's presence requirement: a peer that vanished
  // without a goodbye still has to be announced as gone.
  it('announces a disconnected peer as a leave to whoever remains', () => {
    const { gateway, presence, server, emit } = gatewayWith();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-1' });
    presence.join('room-1', { socketId: 'socket-b', userId: 'user-2' });

    gateway.handleDisconnect(socketFor('socket-a', USER));

    expect(presence.participantsOf('room-1')).toEqual([
      { socketId: 'socket-b', userId: 'user-2' },
    ]);
    expect(server.to).toHaveBeenCalledWith('room-1');
    expect(emit).toHaveBeenCalledWith('peer-left', {
      socketId: 'socket-a',
      userId: 'user-1',
      reason: 'disconnected',
    });
  });

  it('disconnecting a socket in no room emits nothing', () => {
    const { gateway, server } = gatewayWith();

    gateway.handleDisconnect(socketFor('socket-a', USER));

    expect(server.to).not.toHaveBeenCalled();
  });
});

describe('PeerGateway signalling relay', () => {
  it('relays an offer only to the named target, scoped to the room', () => {
    const { gateway, presence, server, emit } = gatewayWith();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-1' });
    const client = socketFor('socket-a', USER);

    const result = gateway.offer(client, {
      room: 'room-1',
      to: 'socket-b',
      payload: { sdp: 'offer-sdp' },
    });

    expect(server.to).toHaveBeenCalledWith('socket-b');
    expect(emit).toHaveBeenCalledWith('offer', {
      from: 'socket-a',
      payload: { sdp: 'offer-sdp' },
    });
    expect(result).toEqual({ relayed: true });
  });

  it('refuses to relay from a socket that never joined the room', () => {
    const { gateway, server } = gatewayWith();
    const client = socketFor('socket-a', USER);

    const result = gateway.answer(client, {
      room: 'room-1',
      to: 'socket-b',
      payload: {},
    });

    expect(result).toEqual({ error: 'not in room' });
    expect(server.to).not.toHaveBeenCalled();
  });

  it('relays an ICE candidate the same way as an offer or answer', () => {
    const { gateway, presence, emit } = gatewayWith();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-1' });
    const client = socketFor('socket-a', USER);

    gateway.iceCandidate(client, {
      room: 'room-1',
      to: 'socket-b',
      payload: { candidate: 'c1' },
    });

    expect(emit).toHaveBeenCalledWith('ice-candidate', {
      from: 'socket-a',
      payload: { candidate: 'c1' },
    });
  });
});

describe('PeerGateway TURN credentials', () => {
  it('mints TURN credentials labelled with the caller, not the socket id', () => {
    const { gateway } = gatewayWith();
    const client = socketFor('socket-a', USER);

    const credentials = gateway.turnCredentials(client);

    expect(credentials.username.endsWith(':user-1')).toBe(true);
  });
});
