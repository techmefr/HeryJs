import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxPruneTask {
  constructor(
    private readonly outbox: OutboxService,
    private readonly store: ScheduledTaskStore,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'outbox-prune' })
  async run(): Promise<void> {
    await this.store.run('outbox-prune', async () => {
      await this.outbox.prune();
    });
  }
}
