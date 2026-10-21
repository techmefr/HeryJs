import { prettyFactory } from 'pino-pretty';
import type { LogDriver, LogEntry } from './log-driver';

export interface StdoutLogOptions {
  isPretty: boolean;
  write?: (text: string) => void;
}

const PRETTY_ENVIRONMENTS_EXCLUDED = new Set(['production', 'test']);

export function shouldPrettyPrint(nodeEnv: string | undefined): boolean {
  return !PRETTY_ENVIRONMENTS_EXCLUDED.has(nodeEnv ?? '');
}

/**
 * The default, and what logging was before there was a contract: one JSON line
 * per entry on stdout in production, which is what `docker logs` and every log
 * collector already read, and the pretty single-line form everywhere a human is
 * the reader. It needs no credentials and has no network, which is what makes a
 * freshly generated app safe to run.
 */
export class StdoutLogDriver implements LogDriver {
  private readonly pretty: ((line: string) => string) | null;
  private readonly emit: (text: string) => void;

  constructor(options: StdoutLogOptions) {
    this.pretty = options.isPretty
      ? prettyFactory({ singleLine: true, colorize: process.stdout.isTTY })
      : null;
    this.emit = options.write ?? ((text) => void process.stdout.write(text));
  }

  write(entry: LogEntry): void {
    this.emit(this.pretty ? this.pretty(entry.raw) : `${entry.raw}\n`);
  }
}
