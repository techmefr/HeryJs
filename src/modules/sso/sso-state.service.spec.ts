import { SsoRefusedException } from './sso-refused.exception';
import { SSO_STATE_COOKIE, SsoStateService } from './sso-state.service';

describe('SsoStateService', () => {
  const service = new SsoStateService();

  it('verifies the state it started', () => {
    const started = service.start('conn-1', '/home');
    const payload = service.verify(started.cookieValue, started.state);

    expect(payload.connectionId).toBe('conn-1');
    expect(payload.returnTo).toBe('/home');
    expect(payload.nonce).toBe(started.nonce);
  });

  it('refuses a missing cookie or state parameter', () => {
    const started = service.start('conn-1', null);

    expect(() => service.verify(null, started.state)).toThrow(
      SsoRefusedException,
    );
    expect(() => service.verify(started.cookieValue, null)).toThrow(
      SsoRefusedException,
    );
  });

  it('refuses a state parameter that is not the one in the cookie', () => {
    const started = service.start('conn-1', null);

    expect(() => service.verify(started.cookieValue, 'forged')).toThrow(
      SsoRefusedException,
    );
  });

  it('refuses a cookie whose body was changed after signing', () => {
    const started = service.start('conn-1', null);
    const [body, signature] = started.cookieValue.split('.');
    const decoded = JSON.parse(
      Buffer.from(body ?? '', 'base64url').toString(),
    ) as Record<string, unknown>;
    const forged = Buffer.from(
      JSON.stringify({ ...decoded, connectionId: 'conn-2' }),
    ).toString('base64url');

    expect(() =>
      service.verify(`${forged}.${signature}`, started.state),
    ).toThrow(SsoRefusedException);
  });

  it('refuses an expired cookie', () => {
    const started = service.start('conn-1', null);
    const realNow = Date.now;

    Date.now = () => realNow() + 11 * 60 * 1000;

    try {
      expect(() => service.verify(started.cookieValue, started.state)).toThrow(
        SsoRefusedException,
      );
    } finally {
      Date.now = realNow;
    }
  });

  it('reads its own cookie out of a header', () => {
    expect(service.cookieFrom(`a=1; ${SSO_STATE_COOKIE}=abc.def; b=2`)).toBe(
      'abc.def',
    );
    expect(service.cookieFrom('a=1')).toBeNull();
    expect(service.cookieFrom(undefined)).toBeNull();
  });
});
