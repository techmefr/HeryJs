import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import type { BillingEvent } from '#kernel/billing/billing-driver';

/**
 * The local truth about what a tenant is subscribed to, refreshed from the
 * provider's own webhook rather than queried from it on every request. The
 * alternative -- calling the provider's API on every quota check -- makes
 * every request that touches a quota-bound action depend on that provider's
 * uptime and latency.
 *
 * Keyed on (provider, providerSubscriptionId) rather than on the tenant alone:
 * the tenant may hold more than one subscription, one per product this app
 * sells separately, and a single row per tenant would make a second
 * subscription overwrite the first.
 */
@Injectable()
export class BillingSubscriptionMirror {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  /**
   * An upsert, because the mirror is a projection of whatever the provider's
   * webhook last said -- there is no meaningful "create" versus "update" from
   * this module's side, only "this is now true". Called from inside
   * runInTenant(event.tenantId, ...), so the extension stamps and filters
   * tenantId the same way every other tenant-scoped write in this codebase
   * does.
   */
  async mirror(event: BillingEvent): Promise<void> {
    await this.prisma.billingSubscription.upsert({
      where: {
        provider_providerSubscriptionId: {
          provider: event.provider,
          providerSubscriptionId: event.subscriptionId,
        },
      },
      // The cast is the same one every generated service makes: the
      // tenant-scoping extension stamps tenantId on the way through, so the
      // caller never supplies it, while Prisma's generated input type still
      // requires it.
      create: {
        provider: event.provider,
        providerSubscriptionId: event.subscriptionId,
        plan: event.plan,
        status: event.status,
        currentPeriodEnd: event.currentPeriodEnd,
      } as Prisma.BillingSubscriptionUncheckedCreateInput,
      update: {
        plan: event.plan,
        status: event.status,
        currentPeriodEnd: event.currentPeriodEnd,
      },
    });
  }
}
