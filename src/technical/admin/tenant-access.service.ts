import { Injectable } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import type { Page, PageQuery } from '#technical/http/page-query';

export interface TenantUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  banned: boolean;
  activeSessions: number;
  activeApiKeys: number;
  createdAt: Date;
}

export interface TenantSessionRow {
  id: string;
  userId: string;
  userEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonated: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface TenantApiKeyRow {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * The accounts of one tenant as an operator sees them. User, Session and
 * ApiKey are not tenant-scoped models, so row-level security does not filter
 * them: every query here names the tenant itself, through the owning user for
 * the two that have no tenant column, and a row of another tenant answers
 * exactly like a row that does not exist. Session tokens and key hashes are
 * never selected, so nothing listed can be replayed.
 */
@Injectable()
export class TenantAccessService {
  async users(tenantId: string, page: PageQuery): Promise<Page<TenantUserRow>> {
    const where = { tenantId };
    const now = new Date();

    const [users, total] = await Promise.all([
      authPrismaClient.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          twoFactorEnabled: true,
          banned: true,
          createdAt: true,
          _count: {
            select: {
              sessions: { where: { expiresAt: { gt: now } } },
              apiKeys: { where: { revokedAt: null } },
            },
          },
        },
      }),
      authPrismaClient.user.count({ where }),
    ]);

    return {
      records: users.map(({ _count, ...user }) => ({
        ...user,
        activeSessions: _count.sessions,
        activeApiKeys: _count.apiKeys,
      })),
      total,
    };
  }

  async sessions(
    tenantId: string,
    page: PageQuery,
  ): Promise<Page<TenantSessionRow>> {
    const where = { expiresAt: { gt: new Date() }, user: { tenantId } };

    const [sessions, total] = await Promise.all([
      authPrismaClient.session.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        select: {
          id: true,
          userId: true,
          ipAddress: true,
          userAgent: true,
          impersonatedBy: true,
          createdAt: true,
          expiresAt: true,
          user: { select: { email: true } },
        },
      }),
      authPrismaClient.session.count({ where }),
    ]);

    return {
      records: sessions.map(({ user, impersonatedBy, ...session }) => ({
        ...session,
        userEmail: user.email,
        impersonated: impersonatedBy !== null,
      })),
      total,
    };
  }

  async apiKeys(
    tenantId: string,
    page: PageQuery,
  ): Promise<Page<TenantApiKeyRow>> {
    const where = { user: { tenantId } };

    const [keys, total] = await Promise.all([
      authPrismaClient.apiKey.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        select: {
          id: true,
          name: true,
          userId: true,
          createdAt: true,
          revokedAt: true,
          user: { select: { email: true } },
        },
      }),
      authPrismaClient.apiKey.count({ where }),
    ]);

    return {
      records: keys.map(({ user, ...key }) => ({
        ...key,
        userEmail: user.email,
      })),
      total,
    };
  }

  async revokeSession(tenantId: string, id: string): Promise<void> {
    const result = await authPrismaClient.session.deleteMany({
      where: { id, user: { tenantId } },
    });

    if (result.count === 0) {
      throw new RecordNotFoundException('session');
    }
  }

  async signOutUser(tenantId: string, userId: string): Promise<number> {
    const user = await authPrismaClient.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new RecordNotFoundException('user');
    }

    const result = await authPrismaClient.session.deleteMany({
      where: { userId: user.id },
    });

    return result.count;
  }

  async revokeApiKey(tenantId: string, id: string): Promise<void> {
    const key = await authPrismaClient.apiKey.findFirst({
      where: { id, user: { tenantId } },
      select: { id: true, revokedAt: true },
    });

    if (!key) {
      throw new RecordNotFoundException('apiKey');
    }

    if (key.revokedAt === null) {
      await authPrismaClient.apiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      });
    }
  }
}
