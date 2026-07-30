import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule],
  providers: [LiveAuthGuard],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
