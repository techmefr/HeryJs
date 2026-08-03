import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { PruneController } from './prune.controller';
import { PruneService } from './prune.service';
import { PruneTask } from './prune.task';

@Module({
  imports: [AuthModule, SchedulerModule],
  controllers: [PruneController],
  providers: [PruneService, PruneTask],
})
export class PruneModule {}
