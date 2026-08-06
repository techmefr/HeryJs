import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { PruneService } from './prune.service';
import { PruneTask } from './prune.task';

@Module({
  imports: [AuthModule, SchedulerModule],
  providers: [PruneService, PruneTask],
})
export class PruneModule {}
