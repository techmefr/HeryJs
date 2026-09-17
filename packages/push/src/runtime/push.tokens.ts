import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import type { PushPlatform } from '#kernel/push/push-driver';

export interface DeviceToken {
  id: string;
  token: string;
  platform: PushPlatform;
}

/**
 * The part of push that is not a wrapper around a provider.
 *
 * A device token is not a user attribute: one person has a laptop, a phone and
 * a tablet, and each carries its own. They also die on their own -- the app is
 * uninstalled, the browser clears its subscription, the OS rotates it -- and
 * nothing tells the application except the next send.
 *
 * So the table is the truth about who is reachable, and it is only true if
 * something keeps it that way. That is what this service is for.
 */
@Injectable()
export class PushTokenService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  /**
   * Registration is an upsert on the token itself, not an insert: a browser
   * re-subscribing hands back the same token, and a client that re-registers
   * on every launch -- which is what the platform guides tell it to do --
   * would otherwise fill the table with duplicates of one device.
   *
   * `lastSeenAt` moves on every registration, which is what makes a stale
   * token distinguishable from a quiet one later.
   */
  async register(
    userId: string,
    token: string,
    platform: PushPlatform,
  ): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, lastSeenAt: new Date() },
      create: {
        userId,
        token,
        platform,
        lastSeenAt: new Date(),
      } as Prisma.PushTokenUncheckedCreateInput,
    });
  }

  async forUser(userId: string): Promise<DeviceToken[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { id: true, token: true, platform: true },
    });

    return rows.map((row) => ({
      id: row.id,
      token: row.token,
      platform: row.platform as PushPlatform,
    }));
  }

  /**
   * Deleted outright rather than soft-deleted. A dead token is not a record
   * anyone will ever want back: it identifies a device that no longer accepts
   * anything, and keeping it means every later send tries it again and every
   * count of reachable users is wrong by one.
   */
  async forget(tokens: string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }

    await this.prisma.pushToken.deleteMany({
      where: { token: { in: tokens } },
    });
  }

  /**
   * Providers only report a dead token when something is sent to it, so a
   * device that stopped registering and is never sent to stays in the table
   * forever, silently inflating how reachable a user looks. This is the sweep
   * for those: unseen for long enough is treated as gone.
   */
  async forgetUnseenSince(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.pushToken.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });

    return count;
  }
}
