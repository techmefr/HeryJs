import { parseEnv } from './env';

const SECRETS = [
  ['SIGNAL_TOKEN_SECRET', 'dev-signal-secret-change-in-production'],
  ['STORAGE_URL_SECRET', 'dev-storage-secret-change-in-production'],
  ['SSE_TOKEN_SECRET', 'dev-sse-secret-change-in-production'],
  ['OAUTH_STATE_SECRET', 'dev-oauth-secret-change-in-production'],
] as const;

const NAMES = SECRETS.map(([name]) => name);
const BASE = { DATABASE_URL: 'postgresql://example/db' };

describe('secrets that must not reach production', () => {
  it.each(SECRETS)(
    '%s falls back to its development default outside production',
    (name, devValue) => {
      const env = parseEnv({ ...BASE, NODE_ENV: 'development' });

      expect(env[name]).toBe(devValue);
    },
  );

  it.each(SECRETS)('%s refuses its own default in production', (name) => {
    // Every other secret is set, so the only thing left to reject is this one.
    const others = Object.fromEntries(
      NAMES.filter((other) => other !== name).map((other) => [
        other,
        `a-real-${other}`,
      ]),
    );

    expect(() =>
      parseEnv({ ...BASE, ...others, NODE_ENV: 'production' }),
    ).toThrow(new RegExp(`${name}: is still the development default`));
  });

  it.each(SECRETS)('%s is accepted in production once set', (name) => {
    const all = Object.fromEntries(
      NAMES.map((other) => [other, `a-real-${other}`]),
    );

    expect(parseEnv({ ...BASE, ...all, NODE_ENV: 'production' })[name]).toBe(
      `a-real-${name}`,
    );
  });
});

describe('SECRETS_KEYS', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('falls back to a development key so a project boots without configuring one', () => {
    expect(parseEnv({ ...BASE, NODE_ENV: 'development' }).SECRETS_KEYS).toMatch(
      /^dev:/,
    );
  });

  it('accepts a list of versioned keys and an active id', () => {
    const env = parseEnv({
      ...BASE,
      SECRETS_KEYS: `1:${key},2:${key}`,
      SECRETS_ACTIVE_KEY_ID: '2',
    });

    expect(env.SECRETS_KEYS).toBe(`1:${key},2:${key}`);
    expect(env.SECRETS_ACTIVE_KEY_ID).toBe('2');
  });

  it.each(['not-a-key', '1:c2hvcnQ=', `a b:${key}`, ''])(
    'rejects %j',
    (value) => {
      expect(() => parseEnv({ ...BASE, SECRETS_KEYS: value })).toThrow(
        /SECRETS_KEYS/,
      );
    },
  );
});
