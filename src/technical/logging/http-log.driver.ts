import { BufferedSink } from './buffered-sink';
import type { LogDriver, LogEntry } from './log-driver';

export interface HttpLogOptions {
  url: string;
  token: string | null;
  app: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFERED = 5000;

export interface LokiPushBody {
  streams: Array<{
    stream: Record<string, string>;
    values: Array<[string, string]>;
  }>;
}

/**
 * The body Loki's push endpoint takes: one stream per set of labels, each with
 * `[nanosecond timestamp, line]` pairs. Only `app` and `level` are labels,
 * because every label value multiplies the number of streams the collector has
 * to keep; the tenant and everything else travel inside the line, where they
 * are searchable without costing an index.
 */
export function lokiPushBody(app: string, entries: LogEntry[]): LokiPushBody {
  const byLevel = new Map<string, Array<[string, string]>>();

  for (const entry of entries) {
    const values = byLevel.get(entry.level) ?? [];
    values.push([
      String(BigInt(entry.time.getTime()) * NANOSECONDS_PER_MILLISECOND),
      entry.raw,
    ]);
    byLevel.set(entry.level, values);
  }

  return {
    streams: [...byLevel].map(([level, values]) => ({
      stream: { app, level },
      values,
    })),
  };
}

/**
 * Ships batches to any collector speaking Loki's push API, with the platform's
 * own `fetch` and no client library. A batch the collector refuses, or does not
 * answer within the timeout, is dropped and reported on stderr.
 */
export class HttpLogDriver implements LogDriver {
  private readonly sink: BufferedSink;
  private readonly send: typeof fetch;

  constructor(private readonly options: HttpLogOptions) {
    this.send = options.fetch ?? fetch;
    this.sink = new BufferedSink({
      driver: 'http',
      batchSize: BATCH_SIZE,
      flushIntervalMs: FLUSH_INTERVAL_MS,
      maxBuffered: MAX_BUFFERED,
      send: (batch) => this.post(batch),
    });
  }

  write(entry: LogEntry): void {
    this.sink.push(entry);
  }

  flush(): Promise<void> {
    return this.sink.flush();
  }

  close(): Promise<void> {
    return this.sink.flush();
  }

  private async post(batch: LogEntry[]): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }

    const response = await this.send(this.options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(lokiPushBody(this.options.app, batch)),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `collector answered ${response.status} for a batch of ${batch.length}`,
      );
    }
  }
}
