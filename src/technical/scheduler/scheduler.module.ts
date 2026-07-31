import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '#technical/auth/auth.module';
import { HeartbeatTask } from './heartbeat.task';
import { ScheduledTaskStore } from './scheduled-task.store';
import { SchedulerController } from './scheduler.controller';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule],
  controllers: [SchedulerController],
  providers: [ScheduledTaskStore, HeartbeatTask],
  exports: [ScheduledTaskStore],
})
export class SchedulerModule {}
