import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from './scheduled-task.store';

@Injectable()
export class HeartbeatTask {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'heartbeat' })
  async run(): Promise<void> {
    await this.store.run('heartbeat', () => undefined);
  }
}
