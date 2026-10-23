import { ssoRedirectUri } from './sso-redirect';
import { SsoStateService } from './sso-state.service';
import { heryConfig } from '#kernel/public/config';

describe('sso outside devTools.environments', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('keeps the localhost callback and a plain cookie in a listed environment', () => {
    process.env.NODE_ENV = 'test';

    expect(ssoRedirectUri()).toMatch(/^http:\/\/localhost:\d+\/sso\/callback$/);
    expect(new SsoStateService().cookieOptions().secure).toBe(false);
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

    expect(() => ssoRedirectUri()).toThrow(/SSO_REDIRECT_BASE_URL/);
    expect(new SsoStateService().cookieOptions().secure).toBe(true);
  });

  it('keeps production security under a listed demo', () => {
    const originalDevTools = heryConfig.devTools;
    heryConfig.devTools = { environments: ['development', 'test', 'demo'] };
    process.env.NODE_ENV = 'demo';

    try {
      expect(() => ssoRedirectUri()).toThrow(/SSO_REDIRECT_BASE_URL/);
      expect(new SsoStateService().cookieOptions().secure).toBe(true);
    } finally {
      heryConfig.devTools = originalDevTools;
    }
  });
});
