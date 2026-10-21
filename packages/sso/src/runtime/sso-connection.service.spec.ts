import {
  SsoConnectionService,
  MAX_CONNECTIONS_PER_TENANT,
} from './sso-connection.service';
import { SsoDiscoveryService } from './sso-discovery.service';
import {
  SsoDomainVerifier,
  verificationRecordValue,
} from './sso-domain-verifier';
import { SsoSecretService } from './sso-secret.service';
import { InMemorySsoConnectionStore } from './sso.fakes';
import type { CreateConnectionInput } from './sso.dto';

const ISSUER = 'https://idp.acme.test';

function build(txtRecords: string[] = []) {
  const store = new InMemorySsoConnectionStore();
  const secrets = new SsoSecretService();
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
        }),
      ),
    );
  const discovery = new SsoDiscoveryService(fetchImpl, () =>
    Promise.resolve(['93.184.216.34']),
  );
  const verifier = new SsoDomainVerifier(() => Promise.resolve(txtRecords));
  const service = new SsoConnectionService(
    store,
    'https://api.test/sso/callback',
    secrets,
    discovery,
    verifier,
  );

  return { store, secrets, service };
}

const input: CreateConnectionInput = {
  name: 'Acme',
  issuer: ISSUER,
  clientId: 'client-1',
  clientSecret: 'client-secret',
  linkPolicy: 'refuse',
  domains: ['Acme.Test', 'acme.test', 'acme.example'],
};

describe('SsoConnectionService', () => {
  it('stores the secret sealed and never returns it', async () => {
    const { store, secrets, service } = build();

    const view = await service.create('acme', input);
    const stored = store.rows[0];

    expect(JSON.stringify(view)).not.toContain('client-secret');
    expect(view.hasClientSecret).toBe(true);
    expect(stored?.clientSecret).not.toContain('client-secret');
    expect(secrets.open(stored?.clientSecret ?? '', view.id)).toBe(
      'client-secret',
    );
  });

  it('normalizes and de-duplicates domains and hands out a DNS record per unverified one', async () => {
    const { service } = build();

    const view = await service.create('acme', input);

    expect(view.domains.map((domain) => domain.domain)).toEqual([
      'acme.test',
      'acme.example',
    ]);
    expect(
      view.domains.every((domain) => !domain.isVerified && domain.dnsRecord),
    ).toBe(true);
    expect(view.domains[0]?.dnsRecord?.name).toBe('_hery-sso.acme.test');
    expect(view.redirectUri).toBe('https://api.test/sso/callback');
  });

  it('refuses an invalid domain', async () => {
    const { service } = build();

    await expect(
      service.create('acme', { ...input, domains: ['not a domain'] }),
    ).rejects.toMatchObject({
      reason: 'domain-invalid',
    });
  });

  it('caps the connections of a tenant', async () => {
    const { service } = build();

    for (let index = 0; index < MAX_CONNECTIONS_PER_TENANT; index += 1) {
      await service.create('acme', input);
    }

    await expect(service.create('acme', input)).rejects.toMatchObject({
      reason: 'connection-limit',
    });
    await expect(service.create('globex', input)).resolves.toBeTruthy();
  });

  it('keeps tenants apart on every read and write', async () => {
    const { service } = build();
    const view = await service.create('acme', input);

    await expect(service.get('globex', view.id)).rejects.toThrow(
      /No such SSO connection/,
    );
    await expect(
      service.update('globex', view.id, { name: 'x' }),
    ).rejects.toThrow();
    await expect(service.remove('globex', view.id)).rejects.toThrow();
    await expect(
      service.addDomain('globex', view.id, { domain: 'x.test' }),
    ).rejects.toThrow();
    await expect(service.list('globex')).resolves.toEqual([]);
  });

  it('re-seals a rotated secret under the same connection', async () => {
    const { store, secrets, service } = build();
    const view = await service.create('acme', input);

    await service.update('acme', view.id, {
      clientSecret: 'rotated',
      isEnabled: false,
    });

    expect(secrets.open(store.rows[0]?.clientSecret ?? '', view.id)).toBe(
      'rotated',
    );
    expect(store.rows[0]?.isEnabled).toBe(false);
  });

  it('does not let a patch change the issuer', async () => {
    const { store, service } = build();
    const view = await service.create('acme', input);

    await service.update('acme', view.id, { name: 'Renamed' });

    expect(store.rows[0]?.issuer).toBe(ISSUER);
    expect(store.rows[0]?.name).toBe('Renamed');
  });

  it('verifies a domain only when the TXT record carries its token', async () => {
    const missing = build([]);
    const created = await missing.service.create('acme', input);

    await expect(
      missing.service.verifyDomain('acme', created.id, 'acme.test'),
    ).rejects.toMatchObject({ reason: 'domain-verification-failed' });

    const proven = build();
    const view = await proven.service.create('acme', input);
    const token = proven.store.rows[0]?.domains[0]?.verificationToken ?? '';
    const withRecord = new SsoDomainVerifier(() =>
      Promise.resolve([verificationRecordValue(token)]),
    );
    const service = new SsoConnectionService(
      proven.store,
      'https://api.test/sso/callback',
      proven.secrets,
      new SsoDiscoveryService(
        () => Promise.reject(new Error('unused')),
        () => Promise.resolve([]),
      ),
      withRecord,
    );

    const verified = await service.verifyDomain('acme', view.id, 'ACME.test');

    expect(verified.domains[0]).toMatchObject({
      domain: 'acme.test',
      isVerified: true,
      dnsRecord: null,
    });
  });

  it('refuses to verify a domain another connection already holds verified', async () => {
    const { store, service } = build();
    const first = await service.create('acme', input);
    const second = await service.create('globex', input);
    const firstDomain = store.rows.find((row) => row.id === first.id)
      ?.domains[0];

    if (firstDomain) {
      firstDomain.verifiedAt = new Date();
    }

    const secondToken =
      store.rows.find((row) => row.id === second.id)?.domains[0]
        ?.verificationToken ?? '';
    const verifying = new SsoConnectionService(
      store,
      'https://api.test/sso/callback',
      new SsoSecretService(),
      new SsoDiscoveryService(
        () => Promise.reject(new Error('unused')),
        () => Promise.resolve([]),
      ),
      new SsoDomainVerifier(() =>
        Promise.resolve([verificationRecordValue(secondToken)]),
      ),
    );

    await expect(
      verifying.verifyDomain('globex', second.id, 'acme.test'),
    ).rejects.toMatchObject({
      reason: 'domain-claimed',
    });
  });

  it('adds and removes domains, refusing duplicates and unknown ones', async () => {
    const { service } = build();
    const view = await service.create('acme', input);

    const added = await service.addDomain('acme', view.id, {
      domain: 'extra.test',
    });

    expect(added.domains.map((domain) => domain.domain)).toContain(
      'extra.test',
    );
    await expect(
      service.addDomain('acme', view.id, { domain: 'extra.test' }),
    ).rejects.toMatchObject({
      reason: 'domain-claimed',
    });

    const removed = await service.removeDomain('acme', view.id, 'extra.test');

    expect(removed.domains.map((domain) => domain.domain)).not.toContain(
      'extra.test',
    );
    await expect(
      service.removeDomain('acme', view.id, 'extra.test'),
    ).rejects.toMatchObject({
      reason: 'domain-unknown',
    });
  });
});
