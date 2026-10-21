import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '#kernel/scheduler/scheduled-task.store';
import { NotificationDigestService } from './notification-digest.service';

const TASK_NAME = 'notification-digest';

@Injectable()
export class NotificationDigestTask {
  constructor(
    private readonly digests: NotificationDigestService,
    private readonly store: ScheduledTaskStore,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: TASK_NAME })
  async run(): Promise<void> {
    await this.store.run(TASK_NAME, async () => {
      await this.digests.flushDue(new Date());
    });
  }
}
