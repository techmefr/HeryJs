import type { ErrorReportContext } from '@heryjs/core/drivers';
import { SentryErrorReporterDriver } from './sentry-error-reporter.driver';

const context: ErrorReportContext = {
  errorId: 'err-1',
  tenantId: 'tenant-a',
  user: null,
  request: { method: 'GET', path: '/ping' },
  tags: {},
  extra: {},
};

interface SentEvent {
  event_id: string;
  exception: { values: { value: string }[] };
}

function stubFetch(response: Response): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

describe('SentryErrorReporterDriver', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://abc123@o1.ingest.sentry.io/42';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.SENTRY_DSN;
  });

  it('posts an envelope to the project with the public key', async () => {
    const fetched = stubFetch(new Response('{}', { status: 200 }));

    await new SentryErrorReporterDriver().capture(new Error('boom'), context);

    const [url, init] = fetched.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    const [header = '', item = '', payload = ''] = init.body.split('\n');

    expect(url).toBe('https://o1.ingest.sentry.io/api/42/envelope/');
    expect(init.headers['x-sentry-auth']).toContain('sentry_key=abc123');
    expect(JSON.parse(item)).toEqual({ type: 'event' });
    const sent = JSON.parse(payload) as SentEvent;
    const envelope = JSON.parse(header) as { event_id: string };

    expect(sent.event_id).toBe(envelope.event_id);
    expect(sent.exception.values[0]?.value).toBe('boom');
  });

  it('rejects on a refusal so the reporter can log it', async () => {
    stubFetch(new Response('rate limited', { status: 429 }));

    await expect(
      new SentryErrorReporterDriver().capture(new Error('boom'), context),
    ).rejects.toThrow(/429/);
  });

  it('refuses to report with no dsn rather than posting nowhere', async () => {
    delete process.env.SENTRY_DSN;
    const fetched = stubFetch(new Response('{}', { status: 200 }));

    await expect(
      new SentryErrorReporterDriver().capture(new Error('boom'), context),
    ).rejects.toThrow();
    expect(fetched).not.toHaveBeenCalled();
  });

  it('waits for the events still in flight when flushing', async () => {
    let release: () => void = () => undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response('{}', { status: 200 }));
        }),
    );
    const driver = new SentryErrorReporterDriver();
    void driver.capture(new Error('boom'), context);

    let flushed = false;
    const flushing = driver.flush(1000).then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);

    release();
    await flushing;
    expect(flushed).toBe(true);
  });
});
