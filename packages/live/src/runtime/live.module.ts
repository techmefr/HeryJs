import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/public/auth';
import { ChangeFeedModule } from '#kernel/public/realtime';
import { ChangeFeedGateway } from './change-feed.gateway';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule, ChangeFeedModule],
  providers: [LiveAuthGuard, ChangeFeedGateway],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
