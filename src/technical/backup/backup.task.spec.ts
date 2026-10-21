import type { SchedulerRegistry } from '@nestjs/schedule';
import type { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { BackupTask } from './backup.task';
import type { BackupSettingsStore } from './backup-settings';
import type { BackupService } from './backup.service';

describe('BackupTask', () => {
  const addCronJob = jest.fn();
  const deleteCronJob = jest.fn();
  const doesExist = jest.fn(() => false);
  const registry = {
    addCronJob,
    deleteCronJob,
    doesExist,
  } as unknown as SchedulerRegistry;
  const task = new BackupTask(
    { run: jest.fn() } as unknown as ScheduledTaskStore,
    { create: jest.fn() } as unknown as BackupService,
    {} as BackupSettingsStore,
    registry,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers nothing while backups are off', () => {
    task.apply({ enabled: false, cron: '0 3 * * *', keep: 7 });

    expect(addCronJob).not.toHaveBeenCalled();
  });

  it('registers one job from the cron expression, and replaces it when the schedule changes', () => {
    task.apply({ enabled: true, cron: '0 3 * * *', keep: 7 });
    expect(addCronJob).toHaveBeenCalledWith(
      'database-backup',
      expect.anything(),
    );

    doesExist.mockReturnValue(true);
    task.apply({ enabled: false, cron: '0 3 * * *', keep: 7 });

    expect(deleteCronJob).toHaveBeenCalledWith('database-backup');
    expect(addCronJob).toHaveBeenCalledTimes(1);
  });
});
