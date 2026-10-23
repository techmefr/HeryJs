import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import { ChangeFeedModule } from '@heryjs/core/realtime';
import { ChangeFeedGateway } from './change-feed.gateway';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule, ChangeFeedModule],
  providers: [LiveAuthGuard, ChangeFeedGateway],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
