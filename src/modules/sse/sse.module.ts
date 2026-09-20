import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { SseController } from './sse.controller';
import { SseStreamService } from './sse-stream.service';
import { SseTokenGuard } from './sse-token.guard';
import { SseTokenService } from './sse-token.service';

@Module({
  imports: [AuthModule],
  controllers: [SseController],
  providers: [SseStreamService, SseTokenService, SseTokenGuard],
  exports: [SseStreamService],
})
export class SseModule {}
