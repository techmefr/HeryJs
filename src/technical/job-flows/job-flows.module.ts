import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { JobFlowHandlers } from './job-flow-handlers';
import { JobFlowPruneTask } from './job-flow-prune.task';
import { JobFlowProcessor } from './job-flow.processor';
import { JobFlowStore } from './job-flow.store';
import { JobFlowsController } from './job-flows.controller';
import { JobFlowsService } from './job-flows.service';

@Module({
  imports: [AuthModule, JobsModule, PrismaModule, SchedulerModule],
  controllers: [JobFlowsController],
  providers: [
    JobFlowHandlers,
    JobFlowProcessor,
    JobFlowPruneTask,
    JobFlowStore,
    JobFlowsService,
  ],
  exports: [JobFlowHandlers, JobFlowsService],
})
export class JobFlowsModule {}
