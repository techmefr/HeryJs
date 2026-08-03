import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { PruneService } from './prune.service';

@Injectable()
export class PruneTask {
  constructor(
    private readonly prune: PruneService,
    private readonly store: ScheduledTaskStore,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'prune' })
  async run(): Promise<void> {
    await this.store.run('prune', async () => {
      await this.prune.pruneDue();
    });
  }
}
