import { SsoConnectionTestService } from './sso-connection-test.service';
import { SsoDiscoveryService } from './sso-discovery.service';
import { generateSamlTestIdp } from './sso-saml.fakes';
import { connectionRecord, InMemorySsoConnectionStore } from './sso.fakes';

const ISSUER = 'https://idp.acme.test';

function build(status: number | 'down') {
  const store = new InMemorySsoConnectionStore();
  const fetchImpl = (url: string): Promise<Response> => {
    if (status === 'down') {
      return Promise.reject(new Error('unreachable'));
    }

    return url.endsWith('/.well-known/openid-configuration')
      ? Promise.resolve(
          new Response(
            JSON.stringify({
              issuer: ISSUER,
              authorization_endpoint: `${ISSUER}/authorize`,
              token_endpoint: `${ISSUER}/token`,
            }),
          ),
        )
      : Promise.resolve(new Response('', { status }));
  };
  const discovery = new SsoDiscoveryService(fetchImpl, () =>
    Promise.resolve(['93.184.216.34']),
  );

  return { store, service: new SsoConnectionTestService(store, discovery) };
}

function samlRecord(certificate: string, entryPoint = `${ISSUER}/sso`) {
  return connectionRecord({
    protocol: 'saml',
    clientSecret: null,
    samlEntryPoint: entryPoint,
    samlCertificate: certificate,
  });
}

describe('SsoConnectionTestService', () => {
  it('passes a SAML connection whose certificate is valid and whose sign-on URL answers', async () => {
    const { store, service } = build(200);

    store.rows.push(samlRecord(generateSamlTestIdp().certificate));

    const view = await service.test('acme', 'conn-1');

    expect(view.isOk).toBe(true);
    expect(view.checks.map((check) => check.name)).toEqual([
      'enabled',
      'verified-domain',
      'certificate',
      'entry-point',
    ]);
  });

  it('flags a sign-on URL that does not answer, a disabled connection and an unverified domain', async () => {
    const { store, service } = build('down');
    const record = samlRecord(generateSamlTestIdp().certificate);

    record.isEnabled = false;
    record.domains[0]!.verifiedAt = null;
    store.rows.push(record);

    const view = await service.test('acme', 'conn-1');

    expect(view.isOk).toBe(false);
    expect(
      view.checks.filter((check) => !check.isOk).map((check) => check.name),
    ).toEqual(['enabled', 'verified-domain', 'entry-point']);
  });

  it('warns when the signing certificate is close to expiry', async () => {
    const { store, service } = build(200);
    const week = 7 * 24 * 60 * 60 * 1000;

    store.rows.push(samlRecord(generateSamlTestIdp('soon', week).certificate));

    const view = await service.test('acme', 'conn-1');
    const certificate = view.checks.find(
      (check) => check.name === 'certificate',
    );

    expect(certificate?.isOk).toBe(true);
    expect(certificate?.detail).toContain('rotate it soon');
  });

  it('checks discovery for an OIDC connection', async () => {
    const { store, service } = build(200);

    store.rows.push(connectionRecord({ issuer: ISSUER }));

    const view = await service.test('acme', 'conn-1');

    expect(view.checks.find((check) => check.name === 'discovery')?.isOk).toBe(
      true,
    );
  });

  it('keeps tenants apart', async () => {
    const { store, service } = build(200);

    store.rows.push(connectionRecord({ issuer: ISSUER }));

    await expect(service.test('globex', 'conn-1')).rejects.toThrow();
    await expect(service.testAll('globex')).resolves.toEqual([]);
    await expect(service.testAll('acme')).resolves.toHaveLength(1);
  });
});
