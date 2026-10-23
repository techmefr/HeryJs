import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '@heryjs/core/database';
import type { AuthenticatedUser } from '@heryjs/core/auth';
import { MS_PER_SECOND } from './two-factor.constants';
import { twoFactorEnv } from './two-factor.env';

@Injectable()
export class TwoFactorSessionService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async markVerified(user: AuthenticatedUser, token: string): Promise<void> {
    const tokenHash = TwoFactorSessionService.hashToken(token);
    const now = Date.now();
    const expiresAt = new Date(
      now + twoFactorEnv().TWO_FACTOR_SESSION_SECONDS * MS_PER_SECOND,
    );

    await this.prisma.twoFactorVerifiedSession.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date(now) } },
    });
    await this.prisma.twoFactorVerifiedSession.upsert({
      where: { tokenHash },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash,
        expiresAt,
      },
      update: { userId: user.id, expiresAt },
    });
  }

  async isVerified(userId: string, token: string): Promise<boolean> {
    const verified = await this.prisma.twoFactorVerifiedSession.findFirst({
      where: {
        userId,
        tokenHash: TwoFactorSessionService.hashToken(token),
        expiresAt: { gt: new Date(Date.now()) },
      },
      select: { id: true },
    });

    return verified !== null;
  }

  async forgetAll(userId: string): Promise<void> {
    await this.prisma.twoFactorVerifiedSession.deleteMany({
      where: { userId },
    });
  }
}
