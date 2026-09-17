import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { LogPushDriver } from './log-push.driver';
import { PushDriverRegistry } from './push-driver.registry';
import { PushService } from './push.service';
import { PushTokenService } from './push.tokens';

@Module({
  imports: [PrismaModule, HeryConfigModule, DriversModule],
  providers: [PushService, PushTokenService, PushDriverRegistry, LogPushDriver],
  exports: [PushService, PushTokenService],
})
export class PushModule {}
