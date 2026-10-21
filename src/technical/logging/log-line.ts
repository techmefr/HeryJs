import { LOG_LEVELS } from './log-driver';
import type { LogEntry, LogLevel } from './log-driver';

const PINO_LEVELS: Record<number, LogLevel> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

const STRUCTURAL_FIELDS = new Set([
  'level',
  'time',
  'msg',
  'pid',
  'hostname',
  'tenantId',
]);

function levelOf(value: unknown): LogLevel {
  if (typeof value === 'number') {
    return PINO_LEVELS[value] ?? 'info';
  }

  return LOG_LEVELS.find((level) => level === value) ?? 'info';
}

function timeOf(value: unknown): Date {
  const time = typeof value === 'number' ? new Date(value) : new Date();

  return Number.isNaN(time.getTime()) ? new Date() : time;
}

/**
 * A line that is not JSON is still a line somebody wrote: it is kept as the
 * message of an info entry instead of dropped, so a stray `console.log` from a
 * dependency reaches every sink like anything else.
 */
export function parseLogLine(line: string): LogEntry {
  const raw = line.endsWith('\n') ? line.slice(0, -1) : line;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return plainEntry(raw);
    }

    const fields = parsed as Record<string, unknown>;

    return {
      time: timeOf(fields.time),
      level: levelOf(fields.level),
      message: typeof fields.msg === 'string' ? fields.msg : '',
      tenantId: typeof fields.tenantId === 'string' ? fields.tenantId : null,
      fields: Object.fromEntries(
        Object.entries(fields).filter(([key]) => !STRUCTURAL_FIELDS.has(key)),
      ),
      raw,
    };
  } catch {
    return plainEntry(raw);
  }
}

function plainEntry(raw: string): LogEntry {
  return {
    time: new Date(),
    level: 'info',
    message: raw,
    tenantId: null,
    fields: {},
    raw,
  };
}
