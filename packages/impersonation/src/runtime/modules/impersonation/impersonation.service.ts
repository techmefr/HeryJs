import { Inject, Injectable } from '@nestjs/common';
import { writeAuditLog } from '#kernel/audit/audit-log';
import {
  authPrismaClient,
  getAuthContext,
} from '#kernel/auth/better-auth.instance';
import type { AuthenticatedUser } from '#kernel/auth/auth.types';
import { CapabilityForbiddenException } from '#kernel/errors/capability-forbidden.exception';
import { NotImpersonatingException } from '#kernel/errors/not-impersonating.exception';
import { RecordNotFoundException } from '#kernel/errors/record-not-found.exception';
import { SelfImpersonationException } from '#kernel/errors/self-impersonation.exception';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';

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
      // The caller's own role is already checked upstream by
      // @Capability(canImpersonate) -- the only way this still throws is
      // Better Auth's other admin-plugin rule, refusing to impersonate a
      // user who is themselves an admin.
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
      userId: admin.id,
      // If the caller starting this session is itself an impersonation, the
      // real human behind the chain is admin.impersonatedBy, not null --
      // hardcoding null here collapsed a nested impersonation down to its
      // intermediate identity and dropped the human from the trail.
      impersonatedBy: admin.impersonatedBy,
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
      userId: user.id,
      impersonatedBy: user.impersonatedBy,
    });
  }
}
