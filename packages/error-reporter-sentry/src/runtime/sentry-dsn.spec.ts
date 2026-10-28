import { parseSentryDsn } from './sentry-dsn';

describe('parseSentryDsn', () => {
  it('builds the envelope url and keeps the public key', () => {
    expect(parseSentryDsn('https://abc123@o1.ingest.sentry.io/42')).toEqual({
      publicKey: 'abc123',
      envelopeUrl: 'https://o1.ingest.sentry.io/api/42/envelope/',
    });
  });

  it('keeps a path prefix used by a self-hosted instance', () => {
    expect(parseSentryDsn('https://k@errors.example.com/sentry/7')).toEqual({
      publicKey: 'k',
      envelopeUrl: 'https://errors.example.com/sentry/api/7/envelope/',
    });
  });

  it('refuses a dsn without a key or a project', () => {
    expect(() => parseSentryDsn('https://o1.ingest.sentry.io/42')).toThrow(
      /must look like/,
    );
    expect(() => parseSentryDsn('https://k@o1.ingest.sentry.io')).toThrow(
      /must look like/,
    );
    expect(() => parseSentryDsn('not a url')).toThrow(/not a valid URL/);
  });
});
