import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { reportLogDriverFailure } from './log-driver-failure';
import type { LogDriver, LogEntry } from './log-driver';

export interface FileLogOptions {
  path: string;
  maxBytes: number;
  maxFiles: number;
}

const DRIVER_NAME = 'file';

/**
 * Appends one JSON line per entry and rotates by size: `app.log` is the live
 * file, `app.log.1` the previous one, up to `maxFiles` generations, the oldest
 * dropped. Size rather than time because a size bound is the one that holds
 * under a burst, and an unbounded log file is how a disk fills.
 *
 * Writes are chained, not awaited by the caller: the line is queued and the
 * logger carries on. Order is preserved because each append starts only after
 * the previous one finished.
 */
export class FileLogDriver implements LogDriver {
  private chain: Promise<void> = Promise.resolve();
  private size: number | null = null;
  private isDirectoryReady = false;

  constructor(private readonly options: FileLogOptions) {}

  write(entry: LogEntry): void {
    this.chain = this.chain
      .then(() => this.append(`${entry.raw}\n`))
      .catch((error: unknown) => {
        reportLogDriverFailure(DRIVER_NAME, error);
      });
  }

  flush(): Promise<void> {
    return this.chain;
  }

  close(): Promise<void> {
    return this.flush();
  }

  private async append(line: string): Promise<void> {
    await this.prepare();

    const bytes = Buffer.byteLength(line);

    if (
      this.size !== null &&
      this.size > 0 &&
      this.size + bytes > this.options.maxBytes
    ) {
      await this.rotate();
    }

    await appendFile(this.options.path, line);
    this.size = (this.size ?? 0) + bytes;
  }

  private async prepare(): Promise<void> {
    if (!this.isDirectoryReady) {
      await mkdir(path.dirname(this.options.path), { recursive: true });
      this.isDirectoryReady = true;
    }

    if (this.size === null) {
      this.size = await currentSize(this.options.path);
    }
  }

  private async rotate(): Promise<void> {
    const { path: live, maxFiles } = this.options;

    for (let generation = maxFiles - 1; generation >= 1; generation -= 1) {
      await renameIfPresent(
        `${live}.${generation}`,
        `${live}.${generation + 1}`,
      );
    }

    if (maxFiles > 1) {
      await renameIfPresent(live, `${live}.1`);
    } else {
      await rm(live, { force: true });
    }

    this.size = 0;
  }
}

async function currentSize(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if (isMissing(error)) {
      return 0;
    }

    throw error;
  }
}

async function renameIfPresent(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
