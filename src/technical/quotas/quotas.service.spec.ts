import { randomUUID } from 'node:crypto';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { TenantQuotaExceededException } from './quota.exceptions';
import { QuotasService } from './quotas.service';
import { RateLimitOverrides } from './rate-limit-overrides';

const config: HeryConfig = {
  quotas: {
    seats: { limit: 5, period: 'total' },
    exports: { limit: 2, period: 'month' },
  },
};

describe('QuotasService against a real database', () => {
  const prisma = createTenantScopedPrismaClient();
  const overrides = new RateLimitOverrides(prisma);
  const service = new QuotasService(config, prisma, overrides);
  const tenantA = `quota-a-${randomUUID()}`;
  const tenantB = `quota-b-${randomUUID()}`;

  const asTenant = <T>(tenantId: string, run: () => Promise<T>) =>
    runInTenant(tenantId, async () => await run());

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await asTenant(tenantId, async () => {
        await prisma.quotaUsage.deleteMany({});
        await prisma.quotaOverride.deleteMany({});
      });
    }
    await prisma.$disconnect();
  });

  it('lets exactly the limit through when requests race for it', async () => {
    const attempts = await asTenant(tenantA, () =>
      Promise.allSettled(
        Array.from({ length: 20 }, () => service.consume('seats')),
      ),
    );

    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(5);
    expect(
      attempts
        .filter((a) => a.status === 'rejected')
        .every((a) => a.reason instanceof TenantQuotaExceededException),
    ).toBe(true);

    const [seats] = await asTenant(tenantA, () => service.usage());

    expect(seats).toMatchObject({ name: 'seats', used: 5, remaining: 0 });
  });

  it('counts a tenant on its own', async () => {
    const result = await asTenant(tenantB, () => service.consume('seats'));

    expect(result).toMatchObject({ used: 1, remaining: 4 });
  });

  it('answers check without counting', async () => {
    const before = await asTenant(tenantB, () => service.check('seats', 4));
    const after = await asTenant(tenantB, () => service.check('seats', 5));

    expect(before).toMatchObject({ allowed: true, used: 1 });
    expect(after).toMatchObject({ allowed: false, used: 1 });
  });

  it('takes an override set for one tenant, and only that tenant', async () => {
    await asTenant(tenantA, () => service.setOverride(tenantA, 'seats', 8));

    const raised = await asTenant(tenantA, () => service.consume('seats', 3));
    const untouched = await asTenant(tenantB, () => service.check('seats'));

    expect(raised).toMatchObject({ limit: 8, used: 8 });
    expect(untouched.limit).toBe(5);
    expect(
      (await asTenant(tenantA, () => service.usage())).find(
        (row) => row.name === 'seats',
      )?.overridden,
    ).toBe(true);
  });

  it('falls back to the default when the override is removed', async () => {
    await asTenant(tenantA, () => service.setOverride(tenantA, 'seats', null));

    const status = await asTenant(tenantA, () => service.check('seats'));

    expect(status.limit).toBe(5);
  });

  it('reads a rate-limit override set through the same table', async () => {
    await service.setOverride(tenantA, 'rate-limit:write', 77);

    await expect(
      asTenant(tenantA, () => overrides.limitFor('write')),
    ).resolves.toBe(77);
    await expect(
      asTenant(tenantB, () => overrides.limitFor('write')),
    ).resolves.toBeUndefined();
  });
});
