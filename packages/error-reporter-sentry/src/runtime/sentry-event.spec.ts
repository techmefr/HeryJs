import type { ErrorReportContext } from '@heryjs/core/drivers';
import { buildSentryEvent, scrubCredentials } from './sentry-event';

const context: ErrorReportContext = {
  errorId: 'err-1',
  tenantId: 'tenant-a',
  user: { id: 'user-1', impersonatedBy: 'admin-1' },
  request: { method: 'POST', path: '/orders' },
  tags: { provider: 'stripe' },
  extra: { orderId: 'o-9' },
};

describe('buildSentryEvent', () => {
  it('carries the tenant, the caller and the request, and nothing else of the request', () => {
    const event = buildSentryEvent(new Error('boom'), context, {
      environment: 'production',
      release: '1.0.0',
    });

    expect(event.tags).toEqual({
      provider: 'stripe',
      errorId: 'err-1',
      tenantId: 'tenant-a',
      impersonatedBy: 'admin-1',
    });
    expect(event.user).toEqual({ id: 'user-1' });
    expect(event.request).toEqual({ method: 'POST', url: '/orders' });
    expect(event.extra).toEqual({ orderId: 'o-9' });
    expect(event.environment).toBe('production');
    expect(event.release).toBe('1.0.0');
  });

  it('marks an unauthenticated error with no tenant and no user', () => {
    const event = buildSentryEvent(
      new Error('boom'),
      { ...context, tenantId: null, user: null, request: null },
      {},
    );

    expect(event.tags.tenantId).toBe('none');
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
  });

  it('reads the stack into frames, oldest call first', () => {
    const error = new Error('boom');
    error.stack = [
      'Error: boom',
      '    at inner (/app/src/a.ts:10:5)',
      '    at /app/src/b.ts:20:7',
    ].join('\n');

    const frames = buildSentryEvent(error, context, {}).exception.values[0]
      ?.stacktrace.frames;

    expect(frames).toEqual([
      {
        function: '<anonymous>',
        filename: '/app/src/b.ts',
        lineno: 20,
        colno: 7,
      },
      { function: 'inner', filename: '/app/src/a.ts', lineno: 10, colno: 5 },
    ]);
  });

  it('scrubs credentials an error message quotes', () => {
    expect(
      scrubCredentials('connect failed: postgres://app:s3cret@db:5432/app'),
    ).toBe('connect failed: postgres://[redacted]@db:5432/app');
  });
});
