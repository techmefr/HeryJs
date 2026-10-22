import { randomUUID } from 'node:crypto';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { PrismaSsoConnectionStore } from './prisma-sso-connection.store';
import { SsoConnectionNotFoundException } from './sso-connection-not-found.exception';
import { SsoConnectionService } from './sso-connection.service';
import { SsoDiscoveryService } from './sso-discovery.service';
import { SsoDomainVerifier } from './sso-domain-verifier';
import { SsoSecretService } from './sso-secret.service';
import type { CreateConnectionInput } from './sso.dto';

const ISSUER = 'https://idp.isolation.test';

function build(): SsoConnectionService {
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

  return new SsoConnectionService(
    new PrismaSsoConnectionStore(),
    'https://api.test/sso/callback',
    new SsoSecretService(),
    new SsoDiscoveryService(fetchImpl, () =>
      Promise.resolve(['93.184.216.34']),
    ),
    new SsoDomainVerifier(() => Promise.resolve([])),
  );
}

function input(domain: string): CreateConnectionInput {
  return {
    protocol: 'oidc',
    name: 'Isolation',
    issuer: ISSUER,
    clientId: 'client-1',
    clientSecret: 'client-secret',
    linkPolicy: 'refuse',
    domains: [domain],
  };
}

describe('tenant isolation', () => {
  const tenantA = `tenant-${randomUUID()}`;
  const tenantB = `tenant-${randomUUID()}`;
  const service = build();
  let connectionOfB: string;

  beforeAll(async () => {
    await service.create(tenantA, input(`${randomUUID()}.a.test`));
    connectionOfB = (
      await service.create(tenantB, input(`${randomUUID()}.b.test`))
    ).id;
  });

  afterAll(async () => {
    await authPrismaClient.ssoConnection.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
  });

  it('lists only the connections of the calling tenant', async () => {
    const listed = await service.list(tenantA);

    expect(listed).toHaveLength(1);
    expect(listed.map((view) => view.id)).not.toContain(connectionOfB);
  });

  it('does not let a tenant read a connection of another tenant', async () => {
    await expect(service.get(tenantA, connectionOfB)).rejects.toBeInstanceOf(
      SsoConnectionNotFoundException,
    );
  });

  it('does not let a tenant change or remove a connection of another tenant', async () => {
    await expect(
      service.update(tenantA, connectionOfB, { name: 'Hijacked' }),
    ).rejects.toBeInstanceOf(SsoConnectionNotFoundException);
    await expect(
      service.addDomain(tenantA, connectionOfB, {
        domain: `${randomUUID()}.hijack.test`,
      }),
    ).rejects.toBeInstanceOf(SsoConnectionNotFoundException);
    await expect(service.remove(tenantA, connectionOfB)).rejects.toBeInstanceOf(
      SsoConnectionNotFoundException,
    );

    const untouched = await service.get(tenantB, connectionOfB);

    expect(untouched.name).toBe('Isolation');
    expect(untouched.domains).toHaveLength(1);
  });
});
