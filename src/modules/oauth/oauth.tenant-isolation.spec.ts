import { randomUUID } from 'node:crypto';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { OAuthAccountService } from './oauth-account.service';
import { PrismaOAuthIdentityStore } from './oauth-identity.store';
import { OAuthRefusedException } from './oauth-refused.exception';
import { OAuthPersonalData } from './oauth.personal-data';
import type { OAuthConfig } from './oauth.types';

const CONFIG: OAuthConfig = {
  linkPolicy: 'link-verified',
  isSignUpAllowed: true,
  redirectBaseUrl: null,
  stateSecret: 'state-secret',
  isProduction: false,
  credentials: {},
  microsoftTenant: 'common',
};

describe('tenant isolation', () => {
  const tenantA = `tenant-${randomUUID()}`;
  const tenantB = `tenant-${randomUUID()}`;
  const accounts = new OAuthAccountService(
    CONFIG,
    new PrismaOAuthIdentityStore(createTenantScopedPrismaClient()),
  );
  const githubIdOfB = `gh-${randomUUID()}`;
  let userOfA: string;
  let userOfB: string;

  const createUser = async (tenantId: string) =>
    (
      await authPrismaClient.user.create({
        data: {
          tenantId,
          email: `${randomUUID()}@isolation.test`,
          emailVerified: true,
        },
      })
    ).id;

  beforeAll(async () => {
    userOfA = await createUser(tenantA);
    userOfB = await createUser(tenantB);
    await authPrismaClient.oauthIdentity.create({
      data: {
        provider: 'github',
        providerUserId: githubIdOfB,
        userId: userOfB,
        email: null,
      },
    });
  });

  afterAll(async () => {
    await authPrismaClient.oauthIdentity.deleteMany({
      where: { userId: { in: [userOfA, userOfB] } },
    });
    await authPrismaClient.user.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
  });

  it('does not let a signed-in user of one tenant take over an identity linked in another tenant', async () => {
    await expect(
      runInTenant(tenantA, () =>
        accounts.resolve({
          provider: 'github',
          profile: {
            providerUserId: githubIdOfB,
            email: null,
            isEmailVerified: false,
            name: null,
            avatarUrl: null,
          },
          linkUserId: userOfA,
          returnTo: null,
        }),
      ),
    ).rejects.toBeInstanceOf(OAuthRefusedException);

    expect(
      await authPrismaClient.oauthIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: 'github',
            providerUserId: githubIdOfB,
          },
        },
        select: { userId: true },
      }),
    ).toEqual({ userId: userOfB });
  });

  it('erases the identities of one tenant and leaves another tenant alone', async () => {
    await authPrismaClient.oauthIdentity.create({
      data: {
        provider: 'google',
        providerUserId: `go-${randomUUID()}`,
        userId: userOfA,
        email: null,
      },
    });
    const registry = new PersonalDataRegistry();

    new OAuthPersonalData(registry).onModuleInit();
    const [hook] = registry.hooks();

    expect(await hook?.eraseTenant?.(tenantA, null)).toBe(1);
    expect(
      await authPrismaClient.oauthIdentity.count({
        where: { userId: userOfB },
      }),
    ).toBe(1);
  });
});
