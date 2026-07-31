import { parseEnv } from './env';

const SECRETS = [
  ['SIGNAL_TOKEN_SECRET', 'dev-signal-secret-change-in-production'],
  ['STORAGE_URL_SECRET', 'dev-storage-secret-change-in-production'],
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
