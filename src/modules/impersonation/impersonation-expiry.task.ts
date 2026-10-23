import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { authPrismaClient } from '@heryjs/core/auth';
import { writeAuditLog } from '@heryjs/core/privacy';
import { ScheduledTaskStore } from '@heryjs/core/jobs';

@Injectable()
export class ImpersonationExpiryTask {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'impersonation-expiry' })
  async run(): Promise<void> {
    await this.store.run('impersonation-expiry', () => this.sweep(new Date()));
  }

  /**
   * A session can end between the read and the delete -- stopped by its
   * admin, signed out, swept by a run on another instance. deleteMany answers
   * that with a count of zero instead of throwing, so one session gone early
   * neither aborts the sweep for the rest nor gets a second audit entry.
   */
  async sweep(now: Date): Promise<void> {
    const expired = await authPrismaClient.session.findMany({
      where: { impersonatedBy: { not: null }, expiresAt: { lt: now } },
      select: { token: true, userId: true, impersonatedBy: true },
    });

    for (const session of expired) {
      const impersonatedBy = session.impersonatedBy;

      if (!impersonatedBy) {
        continue;
      }

      const { count } = await authPrismaClient.session.deleteMany({
        where: { token: session.token },
      });

      if (count === 0) {
        continue;
      }

      const target = await authPrismaClient.user.findUnique({
        where: { id: session.userId },
        select: { tenantId: true },
      });

      if (!target) {
        continue;
      }

      await writeAuditLog(authPrismaClient, {
        tenantId: target.tenantId,
        model: 'Impersonation',
        operation: 'expire',
        recordId: session.userId,
        data: { adminId: impersonatedBy, targetUserId: session.userId },
        userId: session.userId,
        impersonatedBy,
      });
    }
  }
}
