import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { LogDriverRegistry } from './log-driver.registry';

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_MAX_ENTRIES_PER_TENANT = 10_000;

@Injectable()
export class LogPruneTask {
  constructor(
    private readonly drivers: LogDriverRegistry,
    private readonly tasks: ScheduledTaskStore,
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'log-prune' })
  async run(): Promise<void> {
    const store = this.drivers.store;

    if (!store) {
      return;
    }

    await this.tasks.run('log-prune', async () => {
      await store.prune({
        retentionDays:
          this.config.logging?.retentionDays ?? DEFAULT_RETENTION_DAYS,
        maxEntriesPerTenant:
          this.config.logging?.maxEntriesPerTenant ??
          DEFAULT_MAX_ENTRIES_PER_TENANT,
      });
    });
  }
}
