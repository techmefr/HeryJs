import type { AuthenticatedUser } from '#kernel/auth/auth.types';
import { NotImpersonatingException } from '#kernel/errors/not-impersonating.exception';
import { RecordNotFoundException } from '#kernel/errors/record-not-found.exception';
import { SelfImpersonationException } from '#kernel/errors/self-impersonation.exception';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { ImpersonationService } from './impersonation.service';

const ADMIN: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  tenantId: 'acme',
  teamIds: [],
  currentTeamId: null,
  role: 'admin',
  impersonatedBy: null,
};

function serviceFindingUser(
  target: { id: string; email: string; tenantId: string } | null,
): [ImpersonationService, jest.Mock] {
  const findUnique = jest.fn().mockResolvedValue(target);

  return [
    new ImpersonationService({
      user: { findUnique },
    } as unknown as TenantScopedPrismaClient),
    findUnique,
  ];
}

describe('starting an impersonation', () => {
  // Checked before anything is read or written, so an admin cannot mint a
  // second bearer token for themselves and lose the trail in the process.
  it('refuses an admin impersonating themselves', async () => {
    const [service, findUnique] = serviceFindingUser(null);

    await expect(service.start(ADMIN, 'admin-token', ADMIN.id)).rejects.toThrow(
      SelfImpersonationException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  // User is not a tenant-scoped model, so nothing filters this query by tenant
  // for us: the check is by hand, and a target in another tenant has to be
  // indistinguishable from one that does not exist.
  it('refuses a target belonging to another tenant', async () => {
    const [service] = serviceFindingUser({
      id: 'user-2',
      email: 'someone@elsewhere.example',
      tenantId: 'another-tenant',
    });

    await expect(service.start(ADMIN, 'admin-token', 'user-2')).rejects.toThrow(
      RecordNotFoundException,
    );
  });

  it('refuses a target that does not exist', async () => {
    const [service] = serviceFindingUser(null);

    await expect(service.start(ADMIN, 'admin-token', 'nobody')).rejects.toThrow(
      RecordNotFoundException,
    );
  });
});

describe('stopping an impersonation', () => {
  // The token is what identifies the session to delete, so a caller who is not
  // inside one has to be refused rather than have their own session deleted.
  it('refuses a caller who is not impersonating anyone', async () => {
    const [service] = serviceFindingUser(null);

    await expect(service.stop(ADMIN, 'own-token')).rejects.toThrow(
      NotImpersonatingException,
    );
  });
});
