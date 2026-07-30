import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule],
  providers: [LiveAuthGuard],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
