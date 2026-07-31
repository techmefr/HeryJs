import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule],
  providers: [LiveAuthGuard],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
