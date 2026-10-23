import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/public/auth';
import { ChangeFeedModule } from '#technical/public/realtime';
import { ChangeFeedGateway } from './change-feed.gateway';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule, ChangeFeedModule],
  providers: [LiveAuthGuard, ChangeFeedGateway],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
