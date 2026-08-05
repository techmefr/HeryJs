import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { writeAuditLog } from '#technical/audit/audit-log';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';

@Injectable()
export class ImpersonationExpiryTask {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'impersonation-expiry' })
  async run(): Promise<void> {
    await this.store.run('impersonation-expiry', () => this.sweep());
  }

  private async sweep(): Promise<void> {
    const expired = await authPrismaClient.session.findMany({
      where: { impersonatedBy: { not: null }, expiresAt: { lt: new Date() } },
      select: { token: true, userId: true, impersonatedBy: true },
    });

    for (const session of expired) {
      const impersonatedBy = session.impersonatedBy;

      if (!impersonatedBy) {
        continue;
      }

      await authPrismaClient.session.delete({
        where: { token: session.token },
      });

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
