import { Injectable } from '@nestjs/common';
import { LockService } from '#technical/lock/lock.service';

export interface ScheduledTaskRun {
  name: string;
  lastRunAt: string;
  durationMs: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * @Cron fires on every instance a project runs, and nothing here used to stop
 * two of them from firing the same task at the same moment: a prune sweep
 * racing itself, a digest mailed twice, a counter doubled. `run` now takes the
 * task's own name as a lock, so every task calling it gets exclusivity across
 * the cluster without changing a line at its call site.
 *
 * Skipping silently on contention is the right default for a cron -- the other
 * instance is already doing the work -- and it is why LockService itself stays
 * silent instead: a job wanting a different answer calls LockService directly
 * rather than through this scheduler-shaped default.
 */
@Injectable()
export class ScheduledTaskStore {
  private readonly runs = new Map<string, ScheduledTaskRun>();

  constructor(private readonly locks: LockService) {}

  async run(name: string, task: () => Promise<void> | void): Promise<void> {
    await this.locks.runExclusively(name, () => this.execute(name, task));
  }

  private async execute(
    name: string,
    task: () => Promise<void> | void,
  ): Promise<void> {
    const start = process.hrtime.bigint();

    try {
      await task();
      this.runs.set(name, {
        name,
        lastRunAt: new Date().toISOString(),
        durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
        status: 'success',
      });
    } catch (error) {
      this.runs.set(name, {
        name,
        lastRunAt: new Date().toISOString(),
        durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  list(): ScheduledTaskRun[] {
    return [...this.runs.values()];
  }
}
