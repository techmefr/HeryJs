import { SentryErrorReporterDriver } from './sentry-error-reporter.driver';

describe('tenant isolation', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://abc123@o1.ingest.sentry.io/42';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.SENTRY_DSN;
  });

  it('reports each tenant error as its own event carrying nothing of the other', async () => {
    const fetched = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 200 })),
      );
    const driver = new SentryErrorReporterDriver();
    const base = { user: null, request: null, tags: {} };

    await Promise.all([
      driver.capture(new Error('failed for A'), {
        ...base,
        errorId: 'a',
        tenantId: 'tenant-a',
        extra: { secret: 'of A' },
      }),
      driver.capture(new Error('failed for B'), {
        ...base,
        errorId: 'b',
        tenantId: 'tenant-b',
        extra: { secret: 'of B' },
      }),
    ]);

    const bodies = fetched.mock.calls.map(
      ([, init]) => (init as { body: string }).body,
    );

    expect(bodies).toHaveLength(2);
    expect(bodies.find((body) => body.includes('tenant-a'))).not.toMatch(
      /tenant-b|of B/,
    );
    expect(bodies.find((body) => body.includes('tenant-b'))).not.toMatch(
      /tenant-a|of A/,
    );
  });
});
