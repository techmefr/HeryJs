import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const COMPOSE_FILE = 'docker-compose.stream.yml';
const SERVICE_FILE = 'src/technical/stream/stream.service.ts';
const MODULE_FILE = 'src/technical/stream/stream.module.ts';

const COMPOSE_CONTENT = `services:
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    command: --dev --bind 0.0.0.0
    ports:
      - '7880'
      - '7881'
      - '50000-50100:50000-50100/udp'
`;

const SERVICE_CONTENT = `import { Injectable } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'http://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';

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
`;

const MODULE_CONTENT = `import { Module } from '@nestjs/common';
import { StreamService } from './stream.service';

@Module({
  providers: [StreamService],
  exports: [StreamService],
})
export class StreamModule {}
`;

registerModule({
  name: 'stream',
  description:
    'Add one-to-many audio/video streaming via LiveKit (SFU). Use "hery generate <Name> --stream" to add publish/viewer token endpoints to a resource.',
  dependencies: ['livekit-server-sdk'],
  install() {
    const files: Record<string, string> = {
      [COMPOSE_FILE]: COMPOSE_CONTENT,
      [SERVICE_FILE]: SERVICE_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run "docker compose -f docker-compose.stream.yml up -d" (dev mode, key "devkey"/"secret")`,
    );
    console.log(
      `  2. Run "hery generate <Name> --stream" to add publish/viewer token endpoints to a resource`,
    );
    console.log(
      `  3. Import ${pc.bold('StreamModule')} and add ${pc.bold('<Name>StreamController')} to <name>.module.ts`,
    );
  },
});
