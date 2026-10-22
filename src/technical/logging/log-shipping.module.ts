import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PrivacyModule } from '#technical/privacy/privacy.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { DatabaseLogDriver } from './database-log.driver';
import { LogController } from './log.controller';
import { LogDriverRegistry } from './log-driver.registry';
import { LogPersonalData } from './log.personal-data';
import { LogPruneTask } from './log-prune.task';
import { LogService } from './log.service';

@Module({
  imports: [
    AuthModule,
    DriversModule,
    HeryConfigModule,
    PrismaModule,
    PrivacyModule,
    SchedulerModule,
  ],
  controllers: [LogController],
  providers: [
    DatabaseLogDriver,
    LogDriverRegistry,
    LogPersonalData,
    LogPruneTask,
    LogService,
  ],
})
export class LogShippingModule {}
