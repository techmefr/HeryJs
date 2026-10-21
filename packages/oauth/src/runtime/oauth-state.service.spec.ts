import { OAuthRefusedException } from './oauth-refused.exception';
import { OAuthStateService, OAUTH_STATE_COOKIE } from './oauth-state.service';
import { codeChallengeFor } from './oauth-pkce';
import { sanitizeReturnTo } from './oauth-return-to';
import type { OAuthConfig } from './oauth.types';

function config(stateSecret = 'secret'): OAuthConfig {
  return {
    linkPolicy: 'refuse',
    isSignUpAllowed: true,
    redirectBaseUrl: 'https://app.test',
    stateSecret,
    isProduction: false,
    credentials: {},
    microsoftTenant: 'common',
  };
}

function reasonOf(action: () => unknown): string {
  try {
    action();
    return 'accepted';
  } catch (error) {
    return error instanceof OAuthRefusedException ? error.reason : 'other';
  }
}

describe('OAuthStateService', () => {
  const service = new OAuthStateService(config());
  const start = () =>
    service.start({ provider: 'google', returnTo: '/home', linkUserId: null });

  it('round-trips the verifier and nonce for the matching state', () => {
    const started = start();
    const payload = service.verify(
      started.cookieValue,
      'google',
      started.state,
    );

    expect(payload.nonce).toBe(started.nonce);
    expect(codeChallengeFor(payload.codeVerifier)).toBe(started.codeChallenge);
  });

  it('refuses a state that does not match the cookie', () => {
    const started = start();

    expect(
      reasonOf(() => service.verify(started.cookieValue, 'google', 'forged')),
    ).toBe('invalid-state');
  });

  it('refuses a missing cookie or missing state', () => {
    const started = start();

    expect(reasonOf(() => service.verify(null, 'google', started.state))).toBe(
      'invalid-state',
    );
    expect(
      reasonOf(() => service.verify(started.cookieValue, 'google', null)),
    ).toBe('invalid-state');
  });

  it('refuses a cookie issued for another provider', () => {
    const started = start();

    expect(
      reasonOf(() =>
        service.verify(started.cookieValue, 'github', started.state),
      ),
    ).toBe('invalid-state');
  });

  it('refuses a tampered payload', () => {
    const started = start();
    const [body, signature] = started.cookieValue.split('.');
    const payload = JSON.parse(Buffer.from(body ?? '', 'base64url').toString());
    const forged = Buffer.from(
      JSON.stringify({ ...payload, linkUserId: 'victim' }),
    ).toString('base64url');

    expect(
      reasonOf(() =>
        service.verify(`${forged}.${signature}`, 'google', started.state),
      ),
    ).toBe('invalid-state');
  });

  it('refuses a cookie signed under another secret', () => {
    const started = new OAuthStateService(config('other')).start({
      provider: 'google',
      returnTo: null,
      linkUserId: null,
    });

    expect(
      reasonOf(() =>
        service.verify(started.cookieValue, 'google', started.state),
      ),
    ).toBe('invalid-state');
  });

  it('refuses an expired cookie', () => {
    const started = start();
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;

    try {
      expect(
        reasonOf(() =>
          service.verify(started.cookieValue, 'google', started.state),
        ),
      ).toBe('invalid-state');
    } finally {
      Date.now = realNow;
    }
  });

  it('finds its cookie among others', () => {
    expect(service.cookieFrom(`a=1; ${OAUTH_STATE_COOKIE}=abc.def; b=2`)).toBe(
      'abc.def',
    );
    expect(service.cookieFrom('a=1')).toBeNull();
    expect(service.cookieFrom(undefined)).toBeNull();
  });
});

describe('sanitizeReturnTo', () => {
  it.each(['/dashboard', '/a/b?x=1#y'])('keeps the local path %s', (path) => {
    expect(sanitizeReturnTo(path)).toBe(path);
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    'javascript:alert(1)',
    'dashboard',
    '/ok\nLocation: https://evil.example',
    `/${'a'.repeat(600)}`,
    '',
  ])('drops %j', (value) => {
    expect(sanitizeReturnTo(value)).toBeNull();
  });

  it('drops an absent value', () => {
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });
});
