import { Injectable } from '@nestjs/common';

export interface ScheduledTaskRun {
  name: string;
  lastRunAt: string;
  durationMs: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

@Injectable()
export class ScheduledTaskStore {
  private readonly runs = new Map<string, ScheduledTaskRun>();

  async run(name: string, task: () => Promise<void> | void): Promise<void> {
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
