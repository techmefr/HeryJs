import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { QuotasController } from './quotas.controller';
import { QuotasService } from './quotas.service';
import { RateLimitOverrides } from './rate-limit-overrides';

@Module({
  imports: [PrismaModule, AuthModule, HeryConfigModule],
  controllers: [QuotasController],
  providers: [QuotasService, RateLimitOverrides],
  exports: [QuotasService, RateLimitOverrides],
})
export class QuotasModule {}
