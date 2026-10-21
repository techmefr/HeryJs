import type { HeryConfig } from '#technical/config/hery-config.types';
import type { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import type { DatabaseLogDriver } from './database-log.driver';
import type { LogDriverRegistry } from './log-driver.registry';
import { LogPruneTask } from './log-prune.task';

const tasks = {
  run: (_name: string, task: () => Promise<void> | void) =>
    Promise.resolve(task()),
} as ScheduledTaskStore;

function build(store: DatabaseLogDriver | null, config: HeryConfig) {
  return new LogPruneTask({ store } as LogDriverRegistry, tasks, config);
}

describe('LogPruneTask', () => {
  it('does nothing when no store is declared', async () => {
    await expect(build(null, {}).run()).resolves.toBeUndefined();
  });

  it('prunes the store with the configured bounds', async () => {
    const prune = jest.fn(() => Promise.resolve(0));

    await build({ prune } as unknown as DatabaseLogDriver, {
      logging: {
        default: 'store',
        drivers: { store: { driver: 'database' } },
        retentionDays: 3,
        maxEntriesPerTenant: 50,
      },
    }).run();

    expect(prune).toHaveBeenCalledWith({
      retentionDays: 3,
      maxEntriesPerTenant: 50,
    });
  });

  it('falls back to a week and ten thousand lines', async () => {
    const prune = jest.fn(() => Promise.resolve(0));

    await build({ prune } as unknown as DatabaseLogDriver, {}).run();

    expect(prune).toHaveBeenCalledWith({
      retentionDays: 7,
      maxEntriesPerTenant: 10_000,
    });
  });
});
