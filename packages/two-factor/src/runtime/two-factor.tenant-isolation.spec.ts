import { randomUUID } from 'node:crypto';
import { type AuthenticatedUser, authPrismaClient } from '#kernel/public/auth';
import { createTenantScopedPrismaClient } from '#kernel/public/testing';
import { runInTenant } from '#kernel/public/tenancy';
import { TwoFactorCodeVerifier } from './two-factor-code.verifier';
import { TwoFactorRequirementService } from './two-factor-requirement.service';
import { TwoFactorSessionService } from './two-factor-session.service';
import { TwoFactorService } from './two-factor.service';

describe('tenant isolation', () => {
  const tenantA = `tenant-${randomUUID()}`;
  const tenantB = `tenant-${randomUUID()}`;
  const prisma = createTenantScopedPrismaClient();
  const requirements = new TwoFactorRequirementService(prisma);
  const sessions = new TwoFactorSessionService(prisma);
  const twoFactor = new TwoFactorService(
    prisma,
    new TwoFactorCodeVerifier(prisma),
    sessions,
    requirements,
  );
  const userOfB: AuthenticatedUser = {
    id: `user-${randomUUID()}`,
    email: 'b@isolation.test',
    tenantId: tenantB,
    teamIds: [],
    currentTeamId: null,
    role: 'admin',
    impersonatedBy: null,
  };
  const tokenOfB = `token-${randomUUID()}`;

  beforeAll(async () => {
    await authPrismaClient.user.create({
      data: {
        id: userOfB.id,
        tenantId: tenantB,
        email: `${randomUUID()}@b.isolation.test`,
        emailVerified: true,
      },
    });
    await runInTenant(tenantB, async () => {
      await requirements.require(tenantB, 'admin');
      await twoFactor.beginEnrolment(userOfB);
      await sessions.markVerified(userOfB, tokenOfB);
    });
  });

  afterAll(async () => {
    const tenantId = { in: [tenantA, tenantB] };

    await authPrismaClient.twoFactorVerifiedSession.deleteMany({
      where: { tenantId },
    });
    await authPrismaClient.twoFactorEnrolment.deleteMany({
      where: { tenantId },
    });
    await authPrismaClient.twoFactorRoleRequirement.deleteMany({
      where: { tenantId },
    });
    await authPrismaClient.user.deleteMany({ where: { tenantId: tenantB } });
  });

  it('does not apply a role requirement of another tenant', async () => {
    await runInTenant(tenantA, async () => {
      expect(await requirements.isRequiredFor('admin')).toBe(false);
      expect(
        await requirements.list({ page: 1, limit: 50, skip: 0, take: 50 }),
      ).toEqual({
        records: [],
        total: 0,
      });
    });
  });

  it('does not let a tenant release a role requirement of another tenant', async () => {
    await runInTenant(tenantA, () => requirements.release('admin'));

    await runInTenant(tenantB, async () => {
      expect(await requirements.isRequiredFor('admin')).toBe(true);
    });
  });

  it('does not see an enrolment or verified session from another tenant', async () => {
    await runInTenant(tenantA, async () => {
      expect(await sessions.isVerified(userOfB.id, tokenOfB)).toBe(false);
      expect(
        await twoFactor.status({ ...userOfB, tenantId: tenantA }, tokenOfB),
      ).toEqual({
        isEnrolled: false,
        isRequired: false,
        isVerified: false,
        remainingRecoveryCodes: 0,
      });
    });
  });

  it('does not let a tenant forget the verified sessions of another tenant', async () => {
    await runInTenant(tenantA, () => sessions.forgetAll(userOfB.id));

    await runInTenant(tenantB, async () => {
      expect(await sessions.isVerified(userOfB.id, tokenOfB)).toBe(true);
    });
  });
});
