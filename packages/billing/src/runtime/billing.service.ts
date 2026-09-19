import { Inject, Injectable } from '@nestjs/common';
import { HERY_CONFIG } from '#kernel/config/hery-config';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import type { BillingSubscriptionStatus } from '#kernel/billing/billing-driver';
import { QuotaExceededException } from './quota-exceeded.exception';

/**
 * Which mirrored statuses count as "grants access", by default. `active` and
 * `trialing` do; `past_due`, `canceled` and `incomplete` do not.
 *
 * This is a real decision -- the research behind this module named it
 * explicitly as one the framework should not make silently -- so it is a
 * parameter with a documented default, not a hidden constant. A project
 * wanting a grace period on a failed payment passes `past_due` in.
 */
const GRANTING_STATUSES: readonly BillingSubscriptionStatus[] = [
  'active',
  'trialing',
];

@Injectable()
export class BillingService {
  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  /**
   * The plan names currently granting the tenant access, read from the local
   * mirror -- never from the provider directly, so a quota check never waits
   * on that provider's uptime or latency.
   */
  async activePlans(
    tenantId: string,
    grantingStatuses: readonly BillingSubscriptionStatus[] = GRANTING_STATUSES,
  ): Promise<string[]> {
    const rows = await this.prisma.billingSubscription.findMany({
      where: { tenantId, status: { in: grantingStatuses as string[] } },
      select: { plan: true },
    });

    return [...new Set(rows.map((row) => row.plan))];
  }

  /**
   * Throws when `currentCount` has already reached the limit the tenant's
   * plan grants a feature. The limit is read from `hery.config.ts`'s
   * `billingQuotas`, never invented here -- what a plan is called and what it
   * grants is the project's decision, not the framework's.
   *
   * A tenant holding more than one granting subscription takes the highest
   * limit among their plans, not the sum: two subscriptions to two different
   * products each mentioning "projects" almost certainly do not mean their
   * limits should add, and a project that does want them to add is composing
   * two plans deliberately and can sum the numbers itself before calling
   * this.
   *
   * No matching subscription at all fails closed -- see `billingFreePlan` for
   * the explicit opt-out into a freemium default.
   */
  async assertWithinQuota(
    tenantId: string,
    feature: string,
    currentCount: number,
    grantingStatuses: readonly BillingSubscriptionStatus[] = GRANTING_STATUSES,
  ): Promise<void> {
    const plans = await this.activePlans(tenantId, grantingStatuses);
    const effectivePlans =
      plans.length > 0
        ? plans
        : this.config.billingFreePlan
          ? [this.config.billingFreePlan]
          : [];

    const limits = effectivePlans
      .map((plan) => this.config.billingQuotas?.[plan]?.[feature])
      .filter((limit): limit is number => typeof limit === 'number');

    // No plan grants this feature at all -- not "a plan grants zero of it",
    // which is a real, allowed limit -- so the message says there is no
    // access rather than misreporting a limit of zero.
    if (limits.length === 0) {
      throw new QuotaExceededException(feature, 0);
    }

    const limit = Math.max(...limits);

    if (currentCount >= limit) {
      throw new QuotaExceededException(feature, limit);
    }
  }
}
