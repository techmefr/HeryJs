import { reportLogDriverFailure } from './log-driver-failure';
import type { LogEntry } from './log-driver';

export interface BufferedSinkOptions {
  driver: string;
  batchSize: number;
  flushIntervalMs: number;
  maxBuffered: number;
  send: (batch: LogEntry[]) => Promise<void>;
}

/**
 * What every sink that talks over a network or to a database does the same
 * way: take an entry without waiting, send in batches on a timer or when a
 * batch fills, bound what is held, and drop a batch it cannot deliver rather
 * than retry it forever behind a collector that is down.
 *
 * A dropped batch is reported, never raised. The caller is the logger, and a
 * log sink that can make logging throw has made every call site's error path
 * depend on its own.
 */
export class BufferedSink {
  private buffer: LogEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(private readonly options: BufferedSinkOptions) {}

  push(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length > this.options.maxBuffered) {
      this.buffer.splice(0, this.buffer.length - this.options.maxBuffered);
    }

    if (this.buffer.length >= this.options.batchSize) {
      void this.flush();
      return;
    }

    this.timer ??= setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.flushIntervalMs);
    this.timer.unref();
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const batch = this.buffer.splice(0, this.buffer.length);

    if (batch.length === 0) {
      return this.inFlight;
    }

    this.inFlight = this.inFlight.then(async () => {
      try {
        await this.options.send(batch);
      } catch (error) {
        reportLogDriverFailure(this.options.driver, error);
      }
    });

    return this.inFlight;
  }
}
