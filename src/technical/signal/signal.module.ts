import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { SignalController } from './signal.controller';
import { SignalTokenService } from './signal-token.service';
import { SignalService } from './signal.service';

@Module({
  imports: [AuthModule],
  controllers: [SignalController],
  providers: [SignalService, SignalTokenService],
  exports: [SignalService],
})
export class SignalModule {}
