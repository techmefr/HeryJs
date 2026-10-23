import { parseEnv } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://example/db',
  NODE_ENV: 'development',
};

describe('passwordless flags', () => {
  it('leaves every method off unless its flag says true', () => {
    const env = parseEnv(BASE);

    expect(env.AUTH_MAGIC_LINK_ENABLED).toBe(false);
    expect(env.AUTH_EMAIL_OTP_ENABLED).toBe(false);
    expect(env.AUTH_PHONE_OTP_ENABLED).toBe(false);
    expect(env.AUTH_ANONYMOUS_ENABLED).toBe(false);
    expect(env.AUTH_PASSKEY_ENABLED).toBe(false);
  });

  it('turns a method on only for the exact string true', () => {
    const env = parseEnv({
      ...BASE,
      AUTH_MAGIC_LINK_ENABLED: 'true',
      AUTH_EMAIL_OTP_ENABLED: '1',
    });

    expect(env.AUTH_MAGIC_LINK_ENABLED).toBe(true);
    expect(env.AUTH_EMAIL_OTP_ENABLED).toBe(false);
  });

  it('keeps codes short-lived and bounded by default', () => {
    const env = parseEnv(BASE);

    expect(env.AUTH_OTP_EXPIRES_SECONDS).toBe(300);
    expect(env.AUTH_OTP_LENGTH).toBe(6);
    expect(env.AUTH_OTP_MAX_ATTEMPTS).toBe(3);
    expect(env.AUTH_PASSWORDLESS_ALLOW_SIGN_UP).toBe(true);
  });

  it('refuses a code length that is guessable or absurd', () => {
    expect(() => parseEnv({ ...BASE, AUTH_OTP_LENGTH: '3' })).toThrow(
      'AUTH_OTP_LENGTH',
    );
    expect(() => parseEnv({ ...BASE, AUTH_OTP_LENGTH: '12' })).toThrow(
      'AUTH_OTP_LENGTH',
    );
  });

  it('refuses passkeys without a relying party and an origin, naming both', () => {
    expect(() => parseEnv({ ...BASE, AUTH_PASSKEY_ENABLED: 'true' })).toThrow(
      /AUTH_PASSKEY_RP_ID[\s\S]*AUTH_PASSKEY_ORIGIN/,
    );
  });

  it('accepts passkeys once the relying party and origin are set', () => {
    const env = parseEnv({
      ...BASE,
      AUTH_PASSKEY_ENABLED: 'true',
      AUTH_PASSKEY_RP_ID: 'example.com',
      AUTH_PASSKEY_ORIGIN: 'https://example.com',
    });

    expect(env.AUTH_PASSKEY_ENABLED).toBe(true);
    expect(env.AUTH_PASSKEY_RP_NAME).toBe('HeryJs');
  });
});
