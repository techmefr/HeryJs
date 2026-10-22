import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { heryConfig } from '#technical/config/hery-config';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EXPORT_RETENTION_DAYS = 7;

export function exportRetentionDays(): number {
  return (
    heryConfig.privacy?.exportRetentionDays ?? DEFAULT_EXPORT_RETENTION_DAYS
  );
}

/**
 * An export bundle is the whole of what is held about a person. It is cleared
 * the moment it is collected, and this clears the ones nobody collected, once
 * the window in `privacy.exportRetentionDays` has passed. The request row
 * stays: it is the record that the request was answered.
 */
@Injectable()
export class PrivacyRetentionTask {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'privacy-export-retention' })
  async run(): Promise<void> {
    await this.store.run('privacy-export-retention', async () => {
      await this.expireExports(new Date());
    });
  }

  async expireExports(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - exportRetentionDays() * DAY_MS);
    const tenants = await authPrismaClient.user.findMany({
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    let expired = 0;

    // PrivacyRequest is under forced row-level security, so the sweep runs once
    // per tenant, inside that tenant's setting, like every other write to it.
    for (const { tenantId } of tenants) {
      expired += await authPrismaClient.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

        return (
          await tx.privacyRequest.updateMany({
            where: {
              tenantId,
              result: { not: Prisma.AnyNull },
              completedAt: { lt: cutoff },
            },
            data: { result: Prisma.DbNull },
          })
        ).count;
      });
    }

    return expired;
  }
}
