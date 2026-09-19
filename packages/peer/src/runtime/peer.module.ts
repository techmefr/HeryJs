import { Module } from '@nestjs/common';
import { LiveModule } from '#modules/live/live.module';
import { PeerGateway } from './peer.gateway';
import { PeerRoomPresenceService } from './peer-room-presence.service';
import { PeerTurnCredentialsService } from './peer-turn-credentials.service';

// Imports LiveModule rather than redeclaring its own AuthModule wiring: the
// whole point of signalling over the live gateway is one auth path, and
// LiveAuthGuard is where that path lives. A second copy of it would be the
// second auth path the issue this module closes explicitly warns against.
@Module({
  imports: [LiveModule],
  providers: [PeerGateway, PeerRoomPresenceService, PeerTurnCredentialsService],
  exports: [PeerTurnCredentialsService],
})
export class PeerModule {}
