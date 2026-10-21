import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuthModule } from '#technical/auth/auth.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { ExpositionController } from './exposition.controller';
import { ExpositionCronService } from './exposition-cron.service';
import { ExpositionRegistrar } from './exposition-registrar.service';
import { ExpositionRunner } from './exposition-runner.service';
import { ExpositionRegistry } from './exposition.registry';

@Module({
  imports: [DiscoveryModule, AuthModule, SchedulerModule],
  controllers: [ExpositionController],
  providers: [
    ExpositionRegistry,
    ExpositionRegistrar,
    ExpositionRunner,
    ExpositionCronService,
  ],
  exports: [ExpositionRegistry, ExpositionRunner],
})
export class ExpositionModule {}
