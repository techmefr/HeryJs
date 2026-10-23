import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import { ChangeFeedModule } from '@heryjs/core/realtime';
import { SseChangesController } from './sse-changes.controller';
import { SseController } from './sse.controller';
import { SseStreamService } from './sse-stream.service';
import { SseTokenGuard } from './sse-token.guard';
import { SseTokenService } from './sse-token.service';

@Module({
  imports: [AuthModule, ChangeFeedModule],
  controllers: [SseController, SseChangesController],
  providers: [SseStreamService, SseTokenService, SseTokenGuard],
  exports: [SseStreamService],
})
export class SseModule {}
