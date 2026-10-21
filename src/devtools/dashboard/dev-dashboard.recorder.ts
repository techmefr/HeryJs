import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { TelemetryBus } from '#technical/tracing/telemetry-bus';
import type { TelemetryRecord } from '#technical/tracing/telemetry-bus';
import { DEV_DASHBOARD_SETTINGS } from './dev-dashboard.settings';
import type { DevDashboardSettings } from './dev-dashboard.settings';
import { DevDashboardStore } from './dev-dashboard.store';
import {
  mapRecord,
  nPlusOneEntry,
  slowQueryEntry,
} from './dev-dashboard.mapper';
import { sqlFingerprint } from './sql-fingerprint';
import type { NewDevDashboardEntry } from './dev-dashboard.types';

const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH_SIZE = 100;
const MAX_BUFFERED_ENTRIES = 2000;
const MAX_TRACKED_REQUESTS = 500;
const SELF_TABLE = '"DevtoolsEntry"';

interface StatementTally {
  count: number;
  totalMs: number;
}

type QueryRecord = Extract<TelemetryRecord, { kind: 'query' }>;

/**
 * Turns what the kernel reports into rows, without ever being on a request's
 * critical path: a listener only appends to a bounded in-memory buffer, and a
 * timer writes the buffer out. A failed write drops that batch and says so; a
 * request never waits on, or fails because of, its own telemetry.
 *
 * N+1 is judged per request. Each request keeps a tally of how often every
 * distinct statement ran, and the verdict is reached when the request ends --
 * the only moment a count means anything, since a statement run five times
 * across five requests is not a loop.
 */
@Injectable()
export class DevDashboardRecorder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DevDashboard');
  private readonly buffer: NewDevDashboardEntry[] = [];
  private readonly tallies = new Map<string, Map<string, StatementTally>>();
  private unsubscribe: (() => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(
    @Inject(DEV_DASHBOARD_SETTINGS)
    private readonly settings: DevDashboardSettings,
    private readonly store: DevDashboardStore,
  ) {}

  onModuleInit(): void {
    if (!this.settings.isEnabled) {
      return;
    }

    this.unsubscribe = TelemetryBus.subscribe((record) => this.hear(record));
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.flush();
  }

  hear(record: TelemetryRecord): void {
    if (record.kind === 'query') {
      this.hearQuery(record);
      return;
    }

    if (record.kind === 'request') {
      this.judgeRequest(record);
    }

    const entry = mapRecord(record);

    if (entry) {
      this.enqueue(entry);
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      await this.store.insertMany(batch);
    } catch (error) {
      this.logger.warn(
        `Could not persist ${batch.length} dashboard entries, dropping them: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      this.isFlushing = false;
    }
  }

  private hearQuery(record: QueryRecord): void {
    if (record.sql.includes(SELF_TABLE)) {
      return;
    }

    const sql = sqlFingerprint(record.sql);

    if (record.durationMs >= this.settings.slowQueryMs) {
      this.enqueue(slowQueryEntry(record, sql));
    }

    if (record.requestId) {
      this.tally(record.requestId, sql, record.durationMs);
    }
  }

  private tally(requestId: string, sql: string, durationMs: number): void {
    let statements = this.tallies.get(requestId);

    if (!statements) {
      statements = new Map();
      this.tallies.set(requestId, statements);
      this.evictOldestTallies();
    }

    const tally = statements.get(sql) ?? { count: 0, totalMs: 0 };
    tally.count += 1;
    tally.totalMs += durationMs;
    statements.set(sql, tally);
  }

  private evictOldestTallies(): void {
    while (this.tallies.size > MAX_TRACKED_REQUESTS) {
      const oldest = this.tallies.keys().next();

      if (oldest.done) {
        return;
      }

      this.tallies.delete(oldest.value);
    }
  }

  private judgeRequest(record: TelemetryRecord): void {
    if (!record.requestId) {
      return;
    }

    const statements = this.tallies.get(record.requestId);
    this.tallies.delete(record.requestId);

    if (!statements) {
      return;
    }

    for (const [sql, tally] of statements) {
      if (tally.count >= this.settings.nPlusOneThreshold) {
        this.enqueue(
          nPlusOneEntry(
            record.tenantId,
            record.requestId,
            sql,
            tally.count,
            tally.totalMs,
            record.timestamp,
          ),
        );
      }
    }
  }

  private enqueue(entry: NewDevDashboardEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length > MAX_BUFFERED_ENTRIES) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFERED_ENTRIES);
    }

    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
    }
  }
}
