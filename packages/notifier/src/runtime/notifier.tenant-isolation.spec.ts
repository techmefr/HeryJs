import { randomUUID } from 'node:crypto';
import { authPrismaClient } from '#kernel/auth/better-auth.instance';
import { createTenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { NotificationPreferenceService } from './notification-preference.service';

function inTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId }, run);
}

describe('tenant isolation', () => {
  const tenantA = `tenant-a-${randomUUID()}`;
  const tenantB = `tenant-b-${randomUUID()}`;
  const userB = `user-b-${randomUUID()}`;
  const service = new NotificationPreferenceService(
    createTenantScopedPrismaClient(),
  );

  beforeAll(async () => {
    await authPrismaClient.user.create({
      data: { id: userB, email: `${userB}@example.com`, tenantId: tenantB },
    });
    await inTenant(tenantB, async () => {
      await service.saveRules(userB, [
        { channel: 'mail', type: '*', enabled: false, digest: false },
      ]);
      await service.saveSettings(userB, {
        timezone: 'Europe/Paris',
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        digestHour: 8,
      });
    });
  });

  afterAll(async () => {
    await authPrismaClient.user.deleteMany({ where: { id: userB } });
  });

  it("does not read another tenant's preferences, even by naming its user", async () => {
    const seen = await inTenant(tenantA, () => service.rulesFor(userB));

    expect(seen.rules).toEqual([]);
    expect(seen.settings.timezone).not.toBe('Europe/Paris');
  });

  it("cannot overwrite or reset another tenant's preferences", async () => {
    await inTenant(tenantA, async () => {
      await service
        .saveRules(userB, [
          { channel: 'mail', type: '*', enabled: true, digest: true },
        ])
        .catch(() => undefined);
      await service.resetRule(userB, 'mail', '*').catch(() => undefined);
      await service
        .saveSettings(userB, {
          timezone: 'UTC',
          quietHoursStart: null,
          quietHoursEnd: null,
          digestHour: 0,
        })
        .catch(() => undefined);
    });

    const rows = await authPrismaClient.notificationPreference.findMany({
      where: { userId: userB },
    });
    const settings = await authPrismaClient.notificationSetting.findMany({
      where: { userId: userB },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: tenantB,
        channel: 'mail',
        enabled: false,
        digest: false,
      }),
    ]);
    expect(settings).toEqual([
      expect.objectContaining({ tenantId: tenantB, timezone: 'Europe/Paris' }),
    ]);
  });
});
