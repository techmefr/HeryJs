import type { TelemetryRecord } from '#technical/tracing/telemetry-bus';
import type { NewDevDashboardEntry } from './dev-dashboard.types';

export const SYSTEM_TENANT = 'system';

const MAX_LABEL_LENGTH = 300;
const MAX_STACK_LENGTH = 4000;
const MASK = '***';
const VISIBLE_PHONE_DIGITS = 2;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * The dashboard answers "did the mail go out", not "to whom, exactly", so the
 * recipient is kept recognisable and no more: enough of an address or a number
 * to tell two apart, never the whole of it.
 */
export function maskRecipient(recipient: string): string {
  const at = recipient.indexOf('@');

  if (at > 0) {
    return `${recipient.charAt(0)}${MASK}${recipient.slice(at)}`;
  }

  if (/^\+?[\d\s().-]{6,}$/.test(recipient)) {
    const digits = recipient.replace(/\D/g, '');

    return `${MASK}${digits.slice(-VISIBLE_PHONE_DIGITS)}`;
  }

  return recipient;
}

function base(record: TelemetryRecord) {
  return {
    tenantId: record.tenantId ?? SYSTEM_TENANT,
    requestId: record.requestId,
    createdAt: record.timestamp,
  };
}

/**
 * Query events are not mapped here: whether one is worth keeping depends on
 * the threshold and on its neighbours in the same request, which only the
 * recorder knows.
 */
export function mapRecord(
  record: TelemetryRecord,
): NewDevDashboardEntry | null {
  switch (record.kind) {
    case 'request':
      return {
        ...base(record),
        kind: 'request',
        label: truncate(`${record.method} ${record.path}`, MAX_LABEL_LENGTH),
        status: String(record.status),
        durationMs: record.durationMs,
        detail: { method: record.method, path: record.path },
      };
    case 'job':
      return {
        ...base(record),
        kind: 'job',
        label: truncate(`${record.queue}: ${record.name}`, MAX_LABEL_LENGTH),
        status: record.status,
        durationMs: record.durationMs,
        detail: { queue: record.queue, name: record.name, error: record.error },
      };
    case 'message':
      return {
        ...base(record),
        kind: record.channel,
        label: truncate(record.subject ?? record.channel, MAX_LABEL_LENGTH),
        status: record.status,
        durationMs: null,
        detail: {
          recipient: maskRecipient(record.recipient),
          error: record.error,
        },
      };
    case 'exception':
      return {
        ...base(record),
        kind: 'exception',
        label: truncate(`${record.name}: ${record.message}`, MAX_LABEL_LENGTH),
        status: String(record.status),
        durationMs: null,
        detail: {
          name: record.name,
          message: truncate(record.message, MAX_STACK_LENGTH),
          stack: record.stack ? truncate(record.stack, MAX_STACK_LENGTH) : null,
        },
      };
    case 'query':
      return null;
  }
}

export function slowQueryEntry(
  record: Extract<TelemetryRecord, { kind: 'query' }>,
  sql: string,
): NewDevDashboardEntry {
  return {
    ...base(record),
    kind: 'slow-query',
    label: truncate(sql, MAX_LABEL_LENGTH),
    status: null,
    durationMs: record.durationMs,
    detail: { sql: truncate(record.sql, MAX_STACK_LENGTH) },
  };
}

export function nPlusOneEntry(
  tenantId: string | null,
  requestId: string,
  sql: string,
  count: number,
  totalMs: number,
  createdAt: Date,
): NewDevDashboardEntry {
  return {
    tenantId: tenantId ?? SYSTEM_TENANT,
    requestId,
    createdAt,
    kind: 'n-plus-one',
    label: truncate(sql, MAX_LABEL_LENGTH),
    status: null,
    durationMs: totalMs,
    detail: { sql: truncate(sql, MAX_STACK_LENGTH), count },
  };
}
