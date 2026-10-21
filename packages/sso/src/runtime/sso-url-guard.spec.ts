import { SsoRefusedException } from './sso-refused.exception';
import { assertPublicHttpsUrl, isPrivateAddress } from './sso-url-guard';
import type { SsoHostResolver } from './sso-url-guard';

const publicHost: SsoHostResolver = () => Promise.resolve(['93.184.216.34']);

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'])(
    'treats %s as public',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe('assertPublicHttpsUrl', () => {
  it('accepts an https url resolving to a public address', async () => {
    const url = await assertPublicHttpsUrl(
      'https://idp.acme.test/path',
      publicHost,
      false,
    );

    expect(url.hostname).toBe('idp.acme.test');
  });

  it.each([
    'http://idp.acme.test',
    'https://user:pass@idp.acme.test',
    'ftp://idp.acme.test',
    'not a url',
    'https://127.0.0.1',
    'https://[::1]/x',
  ])('refuses %s', async (value) => {
    await expect(
      assertPublicHttpsUrl(value, publicHost, false),
    ).rejects.toBeInstanceOf(SsoRefusedException);
  });

  it('refuses a name that resolves to a private address', async () => {
    const internal: SsoHostResolver = () =>
      Promise.resolve(['93.184.216.34', '10.0.0.5']);

    await expect(
      assertPublicHttpsUrl('https://sneaky.test', internal, false),
    ).rejects.toThrow(/untrusted-issuer/);
  });

  it('refuses a name that does not resolve', async () => {
    const missing: SsoHostResolver = () =>
      Promise.reject(new Error('ENOTFOUND'));

    await expect(
      assertPublicHttpsUrl('https://nowhere.test', missing, false),
    ).rejects.toThrow(/untrusted-issuer/);
  });

  it('allows local http only when private issuers are enabled', async () => {
    await expect(
      assertPublicHttpsUrl('http://localhost:8080', publicHost, true),
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertPublicHttpsUrl('http://localhost:8080', publicHost, false),
    ).rejects.toThrow();
  });
});
