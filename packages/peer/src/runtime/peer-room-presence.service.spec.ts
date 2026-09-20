import { PeerRoomPresenceService } from './peer-room-presence.service';

describe('PeerRoomPresenceService', () => {
  it('lists who is in a room after they join', () => {
    const presence = new PeerRoomPresenceService();

    presence.join('room-1', { socketId: 'socket-a', userId: 'user-a' });
    presence.join('room-1', { socketId: 'socket-b', userId: 'user-b' });

    expect(presence.participantsOf('room-1')).toEqual([
      { socketId: 'socket-a', userId: 'user-a' },
      { socketId: 'socket-b', userId: 'user-b' },
    ]);
  });

  it('removes a participant on an explicit leave', () => {
    const presence = new PeerRoomPresenceService();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-a' });

    const left = presence.leave('room-1', 'socket-a');

    expect(left).toEqual({ socketId: 'socket-a', userId: 'user-a' });
    expect(presence.participantsOf('room-1')).toEqual([]);
  });

  it('leaving a room the socket was never in is a no-op', () => {
    const presence = new PeerRoomPresenceService();

    expect(presence.leave('room-1', 'socket-a')).toBeNull();
  });

  it('keeps two tabs of the same user as independent participants', () => {
    const presence = new PeerRoomPresenceService();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-a' });
    presence.join('room-1', { socketId: 'socket-b', userId: 'user-a' });

    presence.leave('room-1', 'socket-a');

    expect(presence.participantsOf('room-1')).toEqual([
      { socketId: 'socket-b', userId: 'user-a' },
    ]);
  });

  it('treats a disconnect as a leave from every room the socket was in', () => {
    const presence = new PeerRoomPresenceService();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-a' });
    presence.join('room-2', { socketId: 'socket-a', userId: 'user-a' });

    const left = presence.disconnect('socket-a');

    expect(left).toEqual(
      expect.arrayContaining([
        {
          room: 'room-1',
          participant: { socketId: 'socket-a', userId: 'user-a' },
        },
        {
          room: 'room-2',
          participant: { socketId: 'socket-a', userId: 'user-a' },
        },
      ]),
    );
    expect(presence.participantsOf('room-1')).toEqual([]);
    expect(presence.participantsOf('room-2')).toEqual([]);
  });

  it('disconnecting a socket that joined nothing reports no rooms', () => {
    const presence = new PeerRoomPresenceService();

    expect(presence.disconnect('socket-a')).toEqual([]);
  });

  // A room with no members left in it must not linger forever in the map --
  // that is the leak the live module's own README warns is easy to introduce.
  it('drops an empty room rather than keeping a dangling entry', () => {
    const presence = new PeerRoomPresenceService();
    presence.join('room-1', { socketId: 'socket-a', userId: 'user-a' });
    presence.leave('room-1', 'socket-a');
    presence.join('room-1', { socketId: 'socket-b', userId: 'user-b' });

    expect(presence.participantsOf('room-1')).toEqual([
      { socketId: 'socket-b', userId: 'user-b' },
    ]);
  });
});
