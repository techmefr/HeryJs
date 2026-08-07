import { Injectable } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { streamEnv } from './stream.env';

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = streamEnv;

// v1 is scoped to one-to-many: a single publisher per room, any number of
// subscribe-only viewers -- real multi-participant conferencing (mixing N
// publishers) is a later iteration, not a goal of this brick.
@Injectable()
export class StreamService {
  private readonly rooms = new RoomServiceClient(
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
  );

  async ensureRoom(name: string): Promise<void> {
    const existing = await this.rooms.listRooms([name]);
    if (existing.length === 0) {
      await this.rooms.createRoom({ name });
    }
  }

  async deleteRoom(name: string): Promise<void> {
    await this.rooms.deleteRoom(name);
  }

  async publishToken(room: string, identity: string): Promise<string> {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
    });
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: false,
    });
    return token.toJwt();
  }

  async viewerToken(room: string, identity: string): Promise<string> {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
    });
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
    });
    return token.toJwt();
  }
}
