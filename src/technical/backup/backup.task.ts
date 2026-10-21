import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { BackupSettingsStore } from './backup-settings';
import type { BackupSettings } from './backup-settings';
import { BackupService } from './backup.service';

export const BACKUP_TASK_NAME = 'database-backup';

/**
 * Registered at boot from the saved settings instead of with @Cron, because
 * the schedule is something an operator edits from the admin panel: a
 * decorator's expression is fixed when the file is compiled. `apply` replaces
 * the job whenever the settings change, so an edit takes effect without a
 * restart.
 *
 * Off until the settings say so, and checked before the run is recorded, so a
 * project that never asked for backups does not see a "success" for work that
 * was never done. pg_dump has to exist on the machine running the application;
 * the default Node image does not ship it, which is why a run fails loudly
 * instead of skipping when the binary is missing.
 */
@Injectable()
export class BackupTask implements OnModuleInit {
  constructor(
    private readonly store: ScheduledTaskStore,
    private readonly backups: BackupService,
    private readonly settings: BackupSettingsStore,
    private readonly registry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.apply(await this.settings.get());
  }

  apply(settings: BackupSettings): void {
    if (this.registry.doesExist('cron', BACKUP_TASK_NAME)) {
      this.registry.deleteCronJob(BACKUP_TASK_NAME);
    }

    if (!settings.enabled) {
      return;
    }

    const job = CronJob.from({
      cronTime: settings.cron,
      onTick: () => this.run(),
      start: true,
    });

    this.registry.addCronJob(BACKUP_TASK_NAME, job);
  }

  async run(): Promise<void> {
    await this.store.run(BACKUP_TASK_NAME, async () => {
      await this.backups.create();
    });
  }
}
