import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { ImpersonationService } from './impersonation.service';

describe('tenant isolation', () => {
  const tenantA = `tenant-${randomUUID()}`;
  const tenantB = `tenant-${randomUUID()}`;
  const service = new ImpersonationService(createTenantScopedPrismaClient());
  const adminOfA: AuthenticatedUser = {
    id: `admin-${randomUUID()}`,
    email: 'admin@a.isolation.test',
    tenantId: tenantA,
    teamIds: [],
    currentTeamId: null,
    role: 'admin',
    impersonatedBy: null,
  };
  let userOfB: string;

  beforeAll(async () => {
    userOfB = (
      await authPrismaClient.user.create({
        data: {
          tenantId: tenantB,
          email: `${randomUUID()}@b.isolation.test`,
          emailVerified: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await authPrismaClient.session.deleteMany({ where: { userId: userOfB } });
    await authPrismaClient.user.deleteMany({ where: { tenantId: tenantB } });
  });

  it('refuses an admin impersonating a real user of another tenant, and opens no session for them', async () => {
    await expect(
      runInTenant(tenantA, () =>
        service.start(adminOfA, 'admin-token', userOfB),
      ),
    ).rejects.toBeInstanceOf(RecordNotFoundException);

    expect(
      await authPrismaClient.session.count({ where: { userId: userOfB } }),
    ).toBe(0);
    expect(
      await authPrismaClient.auditLog.count({
        where: { tenantId: tenantA, recordId: userOfB },
      }),
    ).toBe(0);
  });
});
