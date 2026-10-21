import type { DriverResolver } from '#technical/drivers/driver-resolver';
import type { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { BackupTask } from './backup.task';

describe('BackupTask', () => {
  const run = jest.fn(async (_name: string, task: () => Promise<void> | void) =>
    task(),
  );
  const store = { run } as unknown as ScheduledTaskStore;
  const drivers = { find: jest.fn() } as unknown as DriverResolver;

  beforeEach(() => {
    run.mockClear();
  });

  it('does nothing, and records nothing, while BACKUP_ENABLED is off', async () => {
    await new BackupTask(store, drivers).run();

    expect(run).not.toHaveBeenCalled();
  });
});
