import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { ChangeFeedModule } from '#technical/change-feed/change-feed.module';
import { ChangeFeedGateway } from './change-feed.gateway';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule, ChangeFeedModule],
  providers: [LiveAuthGuard, ChangeFeedGateway],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
