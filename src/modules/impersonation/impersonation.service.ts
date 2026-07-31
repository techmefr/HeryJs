import { Inject, Injectable } from '@nestjs/common';
import { writeAuditLog } from '../../technical/audit/audit-log';
import {
  authPrismaClient,
  getAuthContext,
} from '../../technical/auth/better-auth.instance';
import type { AuthenticatedUser } from '../../technical/auth/auth.types';
import { CapabilityForbiddenException } from '../../technical/errors/capability-forbidden.exception';
import { NotImpersonatingException } from '../../technical/errors/not-impersonating.exception';
import { RecordNotFoundException } from '../../technical/errors/record-not-found.exception';
import { SelfImpersonationException } from '../../technical/errors/self-impersonation.exception';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';

export interface ImpersonationSession {
  token: string;
  user: { id: string; email: string };
}

/**
 * Better Auth's own impersonation flow is cookie-based: it swaps the session
 * cookie and stashes the admin's original one in a second cookie so it can be
 * restored later. This app is bearer-only and never reads a cookie back, so
 * none of that restore machinery runs -- the target session's token is lifted
 * straight out of the response instead. "Stopping" needs no restore step at
 * all: the admin's original bearer token is never revoked by starting an
 * impersonation, so going back to it is simply a matter of using it again.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async start(
    admin: AuthenticatedUser,
    adminToken: string,
    targetUserId: string,
  ): Promise<ImpersonationSession> {
    if (admin.id === targetUserId) {
      throw new SelfImpersonationException();
    }

    // User is not a tenant-scoped model, so the tenant has to be checked by
    // hand here -- the same shape as TeamsService.addMember, which refuses a
    // cross-tenant grant outright rather than leaving it merely inert.
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, tenantId: true },
    });

    if (!target || target.tenantId !== admin.tenantId) {
      throw new RecordNotFoundException('user');
    }

    const { auth, APIError } = await getAuthContext();
    let result: Awaited<ReturnType<typeof auth.api.impersonateUser>>;

    try {
      result = await auth.api.impersonateUser({
        headers: new Headers({ authorization: `Bearer ${adminToken}` }),
        body: { userId: targetUserId },
      });
    } catch (error) {
      // Not an admin, or the target is itself an admin: Better Auth's own
      // role check (granted only to role "admin", see better-auth.instance.ts)
      // already refused it, so this just gives the refusal HeryJs's shape.
      if (error instanceof APIError) {
        throw new CapabilityForbiddenException({ reason: error.message });
      }
      throw error;
    }

    await writeAuditLog(authPrismaClient, {
      tenantId: admin.tenantId,
      model: 'Impersonation',
      operation: 'start',
      recordId: target.id,
      data: {
        adminId: admin.id,
        targetUserId: target.id,
        targetEmail: target.email,
      },
    });

    return {
      token: result.session.token,
      user: { id: target.id, email: target.email },
    };
  }

  async stop(user: AuthenticatedUser, token: string): Promise<void> {
    if (!user.impersonatedBy) {
      throw new NotImpersonatingException();
    }

    // Deleting the row is enough: it is the only session this token names,
    // and the admin's original session was never touched by starting it.
    await authPrismaClient.session.delete({ where: { token } });

    await writeAuditLog(authPrismaClient, {
      tenantId: user.tenantId,
      model: 'Impersonation',
      operation: 'end',
      recordId: user.id,
      data: { adminId: user.impersonatedBy, targetUserId: user.id },
    });
  }
}
