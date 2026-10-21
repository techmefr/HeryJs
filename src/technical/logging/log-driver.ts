/**
 * Logging is a kernel capability, not an optional module, so this contract has
 * no matching `src/modules/logging`. It lives in its own file rather than beside
 * the registry because a driver shipped as a package (a Datadog or Elastic
 * sink, say) binds `logDriverToken('datadog')` from outside this folder, and
 * `.dependency-cruiser.cjs` forbids that package from reaching a contract owned
 * by a module.
 */
import { driverToken } from '#technical/drivers/driver-token';
import type { PageQuery } from '#technical/http/page-query';

export const LOG_MODULE = 'log';

export function logDriverToken(driverName: string): symbol {
  return driverToken(LOG_MODULE, driverName);
}

export const LOG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * One log line, parsed once and handed to every driver. `raw` is the line
 * exactly as the logger wrote it, because the console and the file ship what
 * was written and only the structured sinks need it taken apart.
 */
export interface LogEntry {
  time: Date;
  level: LogLevel;
  message: string;
  tenantId: string | null;
  fields: Record<string, unknown>;
  raw: string;
}

export interface LogFilter {
  level: LogLevel | null;
  from: Date | null;
  to: Date | null;
  text: string | null;
}

export interface LogRecord {
  id: string;
  time: Date;
  level: string;
  message: string;
  fields: unknown;
}

/**
 * `write` takes one entry and returns nothing, on purpose: it is called from
 * inside the logger, on the path of whatever is being logged, so it must never
 * wait and never throw. A sink that talks to the network buffers and sends on
 * its own schedule, and reports its own failures without raising them.
 */
export interface LogDriver {
  write(entry: LogEntry): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * A driver that keeps what it was given and can answer for it. Only a store
 * can: stdout, a file on a rotation and a remote collector are write-only from
 * here, which is why the query route needs one declared and says so when none is.
 */
export interface QueryableLogDriver extends LogDriver {
  query(
    tenantId: string,
    filter: LogFilter,
    page: PageQuery,
  ): Promise<{ records: LogRecord[]; total: number }>;
}

export function isQueryableLogDriver(
  driver: LogDriver,
): driver is QueryableLogDriver {
  return 'query' in driver && typeof driver.query === 'function';
}
