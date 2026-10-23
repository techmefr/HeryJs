import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/public/auth';
import { PrismaModule } from '#kernel/public/database';
import { TwoFactorCodeVerifier } from './two-factor-code.verifier';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorGuard } from './two-factor.guard';
import { TwoFactorRequirementController } from './two-factor-requirement.controller';
import { TwoFactorRequirementService } from './two-factor-requirement.service';
import { twoFactorEnv } from './two-factor.env';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorSessionService } from './two-factor-session.service';
import './two-factor.catalogue';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TwoFactorController, TwoFactorRequirementController],
  providers: [
    TwoFactorCodeVerifier,
    TwoFactorRequirementService,
    TwoFactorSessionService,
    TwoFactorService,
    TwoFactorGuard,
  ],
  exports: [TwoFactorGuard, TwoFactorService],
})
export class TwoFactorModule {
  constructor() {
    twoFactorEnv();
  }
}
