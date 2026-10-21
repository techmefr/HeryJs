import { Module } from '@nestjs/common';
import { DriversModule } from '#technical/drivers/drivers.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { BackupTask } from './backup.task';

@Module({
  imports: [DriversModule, SchedulerModule],
  providers: [BackupTask],
})
export class BackupModule {}
