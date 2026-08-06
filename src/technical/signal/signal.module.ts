import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { SignalController } from './signal.controller';
import { SignalTokenGuard } from './signal-token.guard';
import { SignalTokenService } from './signal-token.service';
import { SignalService } from './signal.service';

@Module({
  imports: [AuthModule],
  controllers: [SignalController],
  providers: [SignalService, SignalTokenService, SignalTokenGuard],
  exports: [SignalService],
})
export class SignalModule {}
