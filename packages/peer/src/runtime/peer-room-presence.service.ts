import { Injectable } from '@nestjs/common';

export interface PeerParticipant {
  socketId: string;
  userId: string;
}

/**
 * Room membership held in process memory, the same limit the live module's
 * own README already states out loud for Socket.IO rooms: with no Redis
 * adapter installed, membership does not span instances. A deployment behind
 * more than one process needs to add one, exactly as `live` does.
 *
 * Keyed by socket id rather than user id so the same user joining from two
 * tabs is two participants, each free to leave independently -- collapsing
 * them would mean one tab's disconnect silently evicting the other.
 */
@Injectable()
export class PeerRoomPresenceService {
  private readonly rooms = new Map<string, Map<string, PeerParticipant>>();
  private readonly socketRooms = new Map<string, Set<string>>();

  join(room: string, participant: PeerParticipant): void {
    const members = this.rooms.get(room) ?? new Map<string, PeerParticipant>();
    members.set(participant.socketId, participant);
    this.rooms.set(room, members);

    const joined =
      this.socketRooms.get(participant.socketId) ?? new Set<string>();
    joined.add(room);
    this.socketRooms.set(participant.socketId, joined);
  }

  leave(room: string, socketId: string): PeerParticipant | null {
    const members = this.rooms.get(room);
    const participant = members?.get(socketId) ?? null;

    if (!members || !participant) {
      return null;
    }

    members.delete(socketId);
    if (members.size === 0) {
      this.rooms.delete(room);
    }

    this.socketRooms.get(socketId)?.delete(room);

    return participant;
  }

  participantsOf(room: string): PeerParticipant[] {
    return [...(this.rooms.get(room)?.values() ?? [])];
  }

  /**
   * A peer that vanished without sending `leave` -- the network dropped, the
   * tab was closed, the process crashed. Socket.IO's own `disconnect` event
   * is the only signal for that, so this is what a gateway calls from it: it
   * removes the socket from every room it was in and hands back each one so
   * the caller can broadcast a leave to the participants left behind, who
   * would otherwise never learn the peer is gone.
   */
  disconnect(
    socketId: string,
  ): Array<{ room: string; participant: PeerParticipant }> {
    const rooms = this.socketRooms.get(socketId);
    this.socketRooms.delete(socketId);

    if (!rooms) {
      return [];
    }

    return [...rooms].flatMap((room) => {
      const participant = this.leave(room, socketId);
      return participant ? [{ room, participant }] : [];
    });
  }
}
