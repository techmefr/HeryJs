import IORedis from 'ioredis';
import { parseMaintenanceState } from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';

export const MAINTENANCE_KEY = 'hery:maintenance';

const READ_CACHE_MS = 1000;
const COMMAND_TIMEOUT_MS = 500;

export class MaintenanceStore {
  private readonly client: IORedis;

  private cached: { state: MaintenanceState | null; readAt: number } | null =
    null;

  constructor(redisUrl: string) {
    this.client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      commandTimeout: COMMAND_TIMEOUT_MS,
    });
    this.client.on('error', () => undefined);
  }

  async current(): Promise<MaintenanceState | null> {
    const now = Date.now();

    if (this.cached !== null && now - this.cached.readAt < READ_CACHE_MS) {
      return this.cached.state;
    }

    try {
      const state = parseMaintenanceState(
        await this.client.get(MAINTENANCE_KEY),
      );
      this.cached = { state, readAt: now };
      return state;
    } catch {
      return this.cached?.state ?? null;
    }
  }

  async enable(state: MaintenanceState): Promise<void> {
    await this.client.set(MAINTENANCE_KEY, JSON.stringify(state));
    this.cached = null;
  }

  async disable(): Promise<boolean> {
    const removed = await this.client.del(MAINTENANCE_KEY);
    this.cached = null;
    return removed > 0;
  }

  close(): void {
    this.client.disconnect();
  }
}
