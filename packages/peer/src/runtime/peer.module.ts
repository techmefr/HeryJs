import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { PeerGateway } from './peer.gateway';
import { PeerRoomPresenceService } from './peer-room-presence.service';
import { PeerTurnCredentialsService } from './peer-turn-credentials.service';

// Imports AuthModule directly rather than LiveModule: SocketAuthGuard now
// lives in the kernel (#kernel/websocket), so peer reaches the same auth
// path `live` uses without reaching into `live` itself. One auth path
// shared through the kernel, not a second module import between siblings.
@Module({
  imports: [AuthModule],
  providers: [PeerGateway, PeerRoomPresenceService, PeerTurnCredentialsService],
  exports: [PeerTurnCredentialsService],
})
export class PeerModule {}
