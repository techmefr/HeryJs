import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#kernel/config/env';
import { createTenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';
import type { BillingEvent } from '#kernel/billing/billing-driver';
import { BillingSubscriptionMirror } from './billing-subscription.mirror';
import { BillingService } from './billing.service';
import { QuotaExceededException } from './quota-exceeded.exception';

describe('tenant isolation', () => {
  const suffix = randomUUID();
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const subscriptionA = `sub-a-${suffix}`;
  const subscriptionB = `sub-b-${suffix}`;
  const raw = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    }),
  });
  let scoped: TenantScopedPrismaClient;
  let mirror: BillingSubscriptionMirror;
  let billing: BillingService;

  function event(
    tenantId: string,
    subscriptionId: string,
    plan: string,
  ): BillingEvent {
    return {
      provider: 'stripe',
      subscriptionId,
      tenantId,
      plan,
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    };
  }

  beforeAll(async () => {
    scoped = createTenantScopedPrismaClient();
    mirror = new BillingSubscriptionMirror(scoped);
    billing = new BillingService(
      { billingQuotas: { pro: { projects: 5 }, enterprise: { projects: 50 } } },
      scoped,
    );

    await runInTenant(tenantA, () =>
      mirror.mirror(event(tenantA, subscriptionA, 'pro')),
    );
    await runInTenant(tenantB, () =>
      mirror.mirror(event(tenantB, subscriptionB, 'enterprise')),
    );
  });

  afterAll(async () => {
    await raw.billingSubscription.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await raw.$disconnect();
    await scoped.$disconnect();
  });

  it('reads only the plans of the current tenant', async () => {
    expect(
      await runInTenant(tenantA, () => billing.activePlans(tenantA)),
    ).toEqual(['pro']);
  });

  it('does not read another tenant plans even when asked for them by id', async () => {
    expect(
      await runInTenant(tenantA, () => billing.activePlans(tenantB)),
    ).not.toContain('enterprise');
  });

  it('never grants a tenant the quota of another tenant plan', async () => {
    await expect(
      runInTenant(tenantA, () =>
        billing.assertWithinQuota(tenantA, 'projects', 10),
      ),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    await expect(
      runInTenant(tenantA, () =>
        billing.assertWithinQuota(tenantB, 'projects', 10),
      ),
    ).rejects.toBeInstanceOf(QuotaExceededException);
  });

  it('cannot overwrite another tenant subscription by reusing its provider id', async () => {
    await runInTenant(tenantA, () =>
      mirror.mirror(event(tenantA, subscriptionB, 'free')),
    ).catch(() => undefined);

    const rowB = await raw.billingSubscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: 'stripe',
          providerSubscriptionId: subscriptionB,
        },
      },
    });

    expect(rowB).toMatchObject({ tenantId: tenantB, plan: 'enterprise' });
  });
});
