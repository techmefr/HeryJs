import type { HeryConfig } from '#kernel/config/hery-config.types';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { BillingService } from './billing.service';
import { QuotaExceededException } from './quota-exceeded.exception';

interface FakeSubscription {
  tenantId: string;
  plan: string;
  status: string;
}

function fakePrisma(rows: FakeSubscription[]): TenantScopedPrismaClient {
  return {
    billingSubscription: {
      findMany: ({
        where,
      }: {
        where: { tenantId: string; status: { in: string[] } };
      }) =>
        Promise.resolve(
          rows
            .filter(
              (row) =>
                row.tenantId === where.tenantId &&
                where.status.in.includes(row.status),
            )
            .map((row) => ({ plan: row.plan })),
        ),
    },
  } as unknown as TenantScopedPrismaClient;
}

function build(
  config: HeryConfig,
  rows: FakeSubscription[] = [],
): BillingService {
  return new BillingService(config, fakePrisma(rows));
}

describe('BillingService.activePlans', () => {
  it('reads the plans an active or trialing subscription grants', async () => {
    const service = build({}, [
      { tenantId: 't1', plan: 'pro', status: 'active' },
      { tenantId: 't1', plan: 'addon', status: 'trialing' },
    ]);

    expect(await service.activePlans('t1')).toEqual(
      expect.arrayContaining(['pro', 'addon']),
    );
  });

  it('excludes a canceled or past_due subscription by default', async () => {
    const service = build({}, [
      { tenantId: 't1', plan: 'pro', status: 'canceled' },
      { tenantId: 't1', plan: 'pro-2', status: 'past_due' },
    ]);

    expect(await service.activePlans('t1')).toEqual([]);
  });

  it('lets a caller widen which statuses grant access', async () => {
    const service = build({}, [
      { tenantId: 't1', plan: 'pro', status: 'past_due' },
    ]);

    expect(await service.activePlans('t1', ['active', 'past_due'])).toEqual([
      'pro',
    ]);
  });
});

describe('BillingService.assertWithinQuota', () => {
  const config: HeryConfig = {
    billingQuotas: { pro: { projects: 5 }, addon: { projects: 2 } },
  };

  it('allows an action under the limit', async () => {
    const service = build(config, [
      { tenantId: 't1', plan: 'pro', status: 'active' },
    ]);

    await expect(
      service.assertWithinQuota('t1', 'projects', 4),
    ).resolves.toBeUndefined();
  });

  it('refuses once the count has reached the limit', async () => {
    const service = build(config, [
      { tenantId: 't1', plan: 'pro', status: 'active' },
    ]);

    await expect(
      service.assertWithinQuota('t1', 'projects', 5),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });

  /**
   * Two products, each granting "projects", almost certainly do not mean the
   * limits should add -- a project wanting that composes the numbers itself.
   */
  it('takes the highest limit among several granting plans, not the sum', async () => {
    const service = build(config, [
      { tenantId: 't1', plan: 'pro', status: 'active' },
      { tenantId: 't1', plan: 'addon', status: 'active' },
    ]);

    await expect(
      service.assertWithinQuota('t1', 'projects', 4),
    ).resolves.toBeUndefined();
    await expect(
      service.assertWithinQuota('t1', 'projects', 5),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });

  /**
   * Failing closed is the point: a tenant this module has never heard from is
   * refused, not granted an accidental unlimited plan.
   */
  it('refuses a tenant with no subscription at all', async () => {
    const service = build(config, []);

    await expect(
      service.assertWithinQuota('t1', 'projects', 0),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });

  it('grants the configured free plan to a tenant with no subscription', async () => {
    const service = build(
      {
        ...config,
        billingFreePlan: 'free',
        billingQuotas: { ...config.billingQuotas, free: { projects: 1 } },
      },
      [],
    );

    await expect(
      service.assertWithinQuota('t1', 'projects', 0),
    ).resolves.toBeUndefined();
    await expect(
      service.assertWithinQuota('t1', 'projects', 1),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });

  it('refuses a feature no active plan mentions at all', async () => {
    const service = build(config, [
      { tenantId: 't1', plan: 'pro', status: 'active' },
    ]);

    await expect(
      service.assertWithinQuota('t1', 'seats', 0),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });
});
