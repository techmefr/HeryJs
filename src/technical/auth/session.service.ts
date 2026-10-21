import { Injectable } from '@nestjs/common';
import { authPrismaClient } from './better-auth.instance';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import type { Page, PageQuery } from '#technical/http/page-query';
import type { AuthenticatedUser } from './auth.types';

export interface SessionSummary {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export function rawSessionToken(bearer: string): string {
  return bearer.split('.')[0] ?? bearer;
}

@Injectable()
export class SessionService {
  async list(
    user: AuthenticatedUser,
    currentToken: string,
    page: PageQuery,
  ): Promise<Page<SessionSummary>> {
    const where = { userId: user.id, expiresAt: { gt: new Date() } };

    const [sessions, total] = await Promise.all([
      authPrismaClient.session.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      authPrismaClient.session.count({ where }),
    ]);

    return {
      records: sessions.map((session) => ({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        isCurrent: session.token === currentToken,
      })),
      total,
    };
  }

  async revoke(user: AuthenticatedUser, id: string): Promise<void> {
    const result = await authPrismaClient.session.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      throw new RecordNotFoundException('session');
    }
  }

  async revokeOthers(
    user: AuthenticatedUser,
    currentToken: string,
  ): Promise<number> {
    const result = await authPrismaClient.session.deleteMany({
      where: { userId: user.id, token: { not: currentToken } },
    });

    return result.count;
  }

  async revokeAll(user: AuthenticatedUser): Promise<number> {
    const result = await authPrismaClient.session.deleteMany({
      where: { userId: user.id },
    });

    return result.count;
  }
}
