import type { TelemetryRecord } from '#technical/tracing/telemetry-bus';
import {
  SYSTEM_TENANT,
  mapRecord,
  maskRecipient,
  nPlusOneEntry,
} from './dev-dashboard.mapper';

const TIMESTAMP = new Date('2026-10-22T10:00:00.000Z');

function withContext<T extends object>(
  event: T,
): T & {
  tenantId: string | null;
  requestId: string | null;
  timestamp: Date;
} {
  return {
    ...event,
    tenantId: 'acme',
    requestId: 'req-1',
    timestamp: TIMESTAMP,
  };
}

describe('maskRecipient', () => {
  it('keeps the first letter and the domain of an address', () => {
    expect(maskRecipient('jane.doe@example.com')).toBe('j***@example.com');
  });

  it('keeps only the last two digits of a number', () => {
    expect(maskRecipient('+33 6 12 34 56 78')).toBe('***78');
  });

  it('leaves an opaque id alone', () => {
    expect(maskRecipient('user_123')).toBe('user_123');
  });
});

describe('mapRecord', () => {
  it('maps a request without keeping anything but method and path', () => {
    const entry = mapRecord(
      withContext({
        kind: 'request',
        method: 'GET',
        path: '/tags',
        status: 200,
        durationMs: 12,
      } as const),
    );

    expect(entry).toMatchObject({
      tenantId: 'acme',
      kind: 'request',
      label: 'GET /tags',
      status: '200',
      requestId: 'req-1',
      detail: { method: 'GET', path: '/tags' },
    });
  });

  it('files a message under its channel, with the recipient masked', () => {
    const entry = mapRecord(
      withContext({
        kind: 'message',
        channel: 'sms',
        status: 'sent',
        recipient: '+33612345678',
        subject: null,
        error: null,
      } as const),
    );

    expect(entry).toMatchObject({
      kind: 'sms',
      status: 'sent',
      detail: { recipient: '***78', error: null },
    });
  });

  it('records the system tenant for an event that has none', () => {
    const entry = mapRecord({
      ...withContext({
        kind: 'job',
        queue: 'heryjs',
        name: 'mail.send',
        status: 'failed',
        durationMs: 5,
        error: 'boom',
      } as const),
      tenantId: null,
    });

    expect(entry?.tenantId).toBe(SYSTEM_TENANT);
    expect(entry).toMatchObject({ kind: 'job', label: 'heryjs: mail.send' });
  });

  it('truncates an oversized stack', () => {
    const entry = mapRecord(
      withContext({
        kind: 'exception',
        name: 'Error',
        message: 'x',
        stack: 'a'.repeat(10_000),
        status: 500,
      } as const),
    );

    expect(entry).toMatchObject({
      detail: { stack: expect.stringMatching(/^a{4000}$/) as string },
    });
  });

  it('does not map a query', () => {
    const query: TelemetryRecord = withContext({
      kind: 'query',
      sql: 'SELECT 1',
      durationMs: 1,
    } as const);

    expect(mapRecord(query)).toBeNull();
  });
});

describe('nPlusOneEntry', () => {
  it('carries the count and the total time', () => {
    expect(
      nPlusOneEntry('acme', 'req-1', 'SELECT ?', 7, 21, TIMESTAMP),
    ).toMatchObject({
      kind: 'n-plus-one',
      durationMs: 21,
      detail: { sql: 'SELECT ?', count: 7 },
    });
  });
});
