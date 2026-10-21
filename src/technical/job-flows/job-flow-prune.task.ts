import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { FLOW_RETENTION_DAYS } from './job-flow.tree';
import { JobFlowsService } from './job-flows.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The registry row outlives the jobs it points at by nothing: both go after
 * the same window, so a listed flow never points at jobs that are already gone.
 */
@Injectable()
export class JobFlowPruneTask {
  constructor(
    private readonly flows: JobFlowsService,
    private readonly store: ScheduledTaskStore,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'job-flow-prune' })
  async run(): Promise<void> {
    await this.store.run('job-flow-prune', async () => {
      await this.flows.prune(
        new Date(Date.now() - FLOW_RETENTION_DAYS * DAY_MS),
      );
    });
  }
}
