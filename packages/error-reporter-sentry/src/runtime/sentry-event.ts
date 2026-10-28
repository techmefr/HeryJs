import { randomUUID } from 'node:crypto';
import type { ErrorReportContext } from '@heryjs/core/drivers';

const STACK_LINE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const CREDENTIALS_IN_URL = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;

export interface SentryEventSettings {
  environment?: string;
  release?: string;
}

interface SentryFrame {
  function: string;
  filename: string;
  lineno: number;
  colno: number;
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: 'node';
  level: 'error';
  environment?: string;
  release?: string;
  exception: {
    values: {
      type: string;
      value: string;
      stacktrace: { frames: SentryFrame[] };
    }[];
  };
  tags: Record<string, string>;
  user?: { id: string };
  request?: { method: string; url: string };
  extra: Record<string, unknown>;
}

const SECRET_KEY = /authorization|cookie|token|password|secret|api[-_]?key/i;
const MAX_DEPTH = 4;
const REDACTED = '[redacted]';

export function scrubCredentials(message: string): string {
  return message.replace(CREDENTIALS_IN_URL, `$1${REDACTED}@`);
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return scrubCredentials(value);
  }

  if (depth >= MAX_DEPTH || typeof value !== 'object' || value === null) {
    return typeof value === 'object' && value !== null ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  return scrubRecord(value as Record<string, unknown>, depth + 1);
}

function scrubRecord(
  record: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      SECRET_KEY.test(key) ? REDACTED : scrubValue(value, depth),
    ]),
  );
}

function pathWithoutQuery(path: string): string {
  return path.split('?')[0] ?? path;
}

function framesOf(stack: string | undefined): SentryFrame[] {
  const frames: SentryFrame[] = [];

  for (const line of (stack ?? '').split('\n')) {
    const match = STACK_LINE.exec(line);

    if (!match) {
      continue;
    }

    const [, name, filename, lineno, colno] = match;

    frames.push({
      function: name ?? '<anonymous>',
      filename: filename ?? '',
      lineno: Number(lineno),
      colno: Number(colno),
    });
  }

  return frames.reverse();
}

export function buildSentryEvent(
  error: Error,
  context: ErrorReportContext,
  settings: SentryEventSettings,
  now: Date = new Date(),
): SentryEvent {
  const tags: Record<string, string> = {
    ...(scrubRecord(context.tags, 0) as Record<string, string>),
    errorId: context.errorId,
    tenantId: context.tenantId ?? 'none',
  };

  if (context.user?.impersonatedBy) {
    tags.impersonatedBy = context.user.impersonatedBy;
  }

  const event: SentryEvent = {
    event_id: randomUUID().replaceAll('-', ''),
    timestamp: now.getTime() / 1000,
    platform: 'node',
    level: 'error',
    exception: {
      values: [
        {
          type: error.name,
          value: scrubCredentials(error.message),
          stacktrace: { frames: framesOf(error.stack) },
        },
      ],
    },
    tags,
    extra: scrubRecord(context.extra, 0),
  };

  if (settings.environment) {
    event.environment = settings.environment;
  }

  if (settings.release) {
    event.release = settings.release;
  }

  if (context.user) {
    event.user = { id: context.user.id };
  }

  if (context.request) {
    event.request = {
      method: context.request.method,
      url: pathWithoutQuery(context.request.path),
    };
  }

  return event;
}
