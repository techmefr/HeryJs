import { heryConfig } from '#technical/public/config';
import { configFromEnv } from './oauth.module';

describe('oauth outside devTools.environments', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('falls back to localhost in a listed environment', () => {
    process.env.NODE_ENV = 'test';

    expect(configFromEnv().isProduction).toBe(false);
  });

  it.each([
    ['unset', undefined],
    ['an unlisted demo', 'demo'],
  ])('runs as production when NODE_ENV is %s', (_label, nodeEnv) => {
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }

    expect(configFromEnv().isProduction).toBe(true);
  });

  it('keeps production security under a listed demo', () => {
    const originalDevTools = heryConfig.devTools;
    heryConfig.devTools = { environments: ['development', 'test', 'demo'] };
    process.env.NODE_ENV = 'demo';

    try {
      expect(configFromEnv().isProduction).toBe(true);
    } finally {
      heryConfig.devTools = originalDevTools;
    }
  });
});
