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

export function scrubCredentials(message: string): string {
  return message.replace(CREDENTIALS_IN_URL, '$1[redacted]@');
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
    ...context.tags,
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
    extra: context.extra,
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
      url: context.request.path,
    };
  }

  return event;
}
