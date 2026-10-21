import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { DEV_DASHBOARD_SETTINGS } from './dev-dashboard.settings';
import type { DevDashboardSettings } from './dev-dashboard.settings';
import { DevDashboardStore } from './dev-dashboard.store';

@Injectable()
export class DevDashboardPruneTask {
  constructor(
    private readonly store: DevDashboardStore,
    private readonly tasks: ScheduledTaskStore,
    @Inject(DEV_DASHBOARD_SETTINGS)
    private readonly settings: DevDashboardSettings,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'devtools-prune' })
  async run(): Promise<void> {
    if (!this.settings.isEnabled) {
      return;
    }

    await this.tasks.run('devtools-prune', async () => {
      await this.store.prune(this.settings);
    });
  }
}
