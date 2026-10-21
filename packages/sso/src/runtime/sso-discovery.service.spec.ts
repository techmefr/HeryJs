import { SsoDiscoveryService } from './sso-discovery.service';
import type { SsoFetch } from './sso-http';

const publicHost = () => Promise.resolve(['93.184.216.34']);

function jsonFetch(body: unknown, calls: string[] = []): SsoFetch {
  return (url) => {
    calls.push(url);

    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
}

const document = {
  issuer: 'https://idp.acme.test',
  authorization_endpoint: 'https://idp.acme.test/authorize',
  token_endpoint: 'https://idp.acme.test/token',
};

describe('SsoDiscoveryService', () => {
  it('reads the discovery document from the issuer well-known path', async () => {
    const calls: string[] = [];
    const service = new SsoDiscoveryService(
      jsonFetch(document, calls),
      publicHost,
    );

    const result = await service.discover('https://idp.acme.test');

    expect(calls).toEqual([
      'https://idp.acme.test/.well-known/openid-configuration',
    ]);
    expect(result).toEqual({
      issuer: 'https://idp.acme.test',
      authorizationEndpoint: 'https://idp.acme.test/authorize',
      tokenEndpoint: 'https://idp.acme.test/token',
    });
  });

  it('refuses a document that names another issuer', async () => {
    const service = new SsoDiscoveryService(
      jsonFetch({ ...document, issuer: 'https://evil.test' }),
      publicHost,
    );

    await expect(
      service.discover('https://idp.acme.test'),
    ).rejects.toMatchObject({
      reason: 'untrusted-issuer',
    });
  });

  it('refuses an endpoint that points into the private network', async () => {
    const service = new SsoDiscoveryService(
      jsonFetch({
        ...document,
        token_endpoint: 'https://169.254.169.254/token',
      }),
      publicHost,
    );

    await expect(
      service.discover('https://idp.acme.test'),
    ).rejects.toMatchObject({
      reason: 'untrusted-issuer',
    });
  });

  it('refuses a document with no usable endpoints', async () => {
    const service = new SsoDiscoveryService(
      jsonFetch({ issuer: document.issuer }),
      publicHost,
    );

    await expect(
      service.discover('https://idp.acme.test'),
    ).rejects.toMatchObject({
      reason: 'provider-failure',
    });
  });

  it('never fetches an issuer that resolves privately', async () => {
    const calls: string[] = [];
    const service = new SsoDiscoveryService(jsonFetch(document, calls), () =>
      Promise.resolve(['10.0.0.1']),
    );

    await expect(
      service.discover('https://idp.acme.test'),
    ).rejects.toMatchObject({
      reason: 'untrusted-issuer',
    });
    expect(calls).toHaveLength(0);
  });

  it('reports a failing provider as a provider failure', async () => {
    const failing: SsoFetch = () =>
      Promise.resolve(new Response('nope', { status: 500 }));
    const service = new SsoDiscoveryService(failing, publicHost);

    await expect(
      service.discover('https://idp.acme.test'),
    ).rejects.toMatchObject({
      reason: 'provider-failure',
    });
  });
});
