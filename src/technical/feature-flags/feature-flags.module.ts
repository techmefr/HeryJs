import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsDriverRegistry } from './feature-flags-driver.registry';
import { FeatureFlagsService } from './feature-flags.service';
import { LocalFeatureFlagsDriver } from './local-feature-flags.driver';

@Module({
  imports: [PrismaModule, AuthModule, HeryConfigModule, DriversModule],
  controllers: [FeatureFlagsController],
  providers: [
    FeatureFlagsService,
    FeatureFlagsDriverRegistry,
    LocalFeatureFlagsDriver,
  ],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
