import { parseEnv } from '#technical/config/env';
import { buildSocialProviders } from './social-providers';

describe('buildSocialProviders', () => {
  it('registers nothing when no provider credentials are set', () => {
    const providers = buildSocialProviders(
      parseEnv({ DATABASE_URL: 'postgresql://x' }),
    );

    expect(providers).toEqual({});
    expect('google' in providers).toBe(false);
    expect('github' in providers).toBe(false);
  });

  it('registers only the provider whose pair is complete', () => {
    const providers = buildSocialProviders(
      parseEnv({
        DATABASE_URL: 'postgresql://x',
        AUTH_GOOGLE_CLIENT_ID: 'google-id',
        AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      }),
    );

    expect(providers).toEqual({
      google: { clientId: 'google-id', clientSecret: 'google-secret' },
    });
  });

  it('leaves a provider out when only half its pair is set', () => {
    const providers = buildSocialProviders(
      parseEnv({
        DATABASE_URL: 'postgresql://x',
        AUTH_GITHUB_CLIENT_ID: 'github-id',
      }),
    );

    expect(providers).toEqual({});
  });

  it('registers both providers when both pairs are complete', () => {
    const providers = buildSocialProviders(
      parseEnv({
        DATABASE_URL: 'postgresql://x',
        AUTH_GOOGLE_CLIENT_ID: 'google-id',
        AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
        AUTH_GITHUB_CLIENT_ID: 'github-id',
        AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      }),
    );

    expect(Object.keys(providers).sort()).toEqual(['github', 'google']);
  });
});

describe('parseAuthEnv', () => {
  it('defaults every secret to absent rather than to a placeholder', () => {
    const parsed = parseEnv({ DATABASE_URL: 'postgresql://x' });

    expect(parsed.AUTH_GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(parsed.AUTH_GITHUB_CLIENT_SECRET).toBeUndefined();
  });

  it('reads email verification as a boolean and expiries as numbers', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://x',
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
      AUTH_RESET_PASSWORD_EXPIRES_SECONDS: '900',
    });

    expect(parsed.AUTH_REQUIRE_EMAIL_VERIFICATION).toBe(true);
    expect(parsed.AUTH_RESET_PASSWORD_EXPIRES_SECONDS).toBe(900);
    expect(parsed.AUTH_EMAIL_VERIFICATION_EXPIRES_SECONDS).toBe(3600);
  });

  it('rejects a non-positive expiry instead of accepting a token that never lives', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://x',
        AUTH_RESET_PASSWORD_EXPIRES_SECONDS: '0',
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
