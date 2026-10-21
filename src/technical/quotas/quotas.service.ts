import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type {
  HeryConfig,
  HeryConfigQuota,
  HeryConfigQuotaPeriod,
} from '#technical/config/hery-config.types';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { periodKey } from './quota-period';
import {
  QuotaNotDeclaredException,
  TenantQuotaExceededException,
} from './quota.exceptions';
import { RateLimitOverrides } from './rate-limit-overrides';
import { RATE_LIMIT_OVERRIDE_PREFIX } from './quotas.types';
import type { QuotaCheck, QuotaStatus } from './quotas.types';

const DEFAULT_PERIOD: HeryConfigQuotaPeriod = 'month';

/**
 * Per-tenant limits and the counts held against them. What a quota is called
 * and what a tenant gets by default is the project's decision, declared under
 * `quotas` in `hery.config.ts`; a tenant that needs more (or less) has a
 * `QuotaOverride` row. Everything here acts on the ambient tenant, the same
 * one every other tenant-scoped query runs under.
 *
 * The count lives in Postgres, not Redis like the rate-limit counters: a rate
 * limit is a window nobody needs after it closes, so losing it to a Redis
 * flush costs a few seconds of leniency. A quota's count is what a tenant is
 * held to, and may later be what it is billed on, so it has to survive a
 * restart, sit beside the tenant's other rows under the same row-level
 * policy, and stay readable per period afterwards.
 */
@Injectable()
export class QuotasService {
  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly rateLimitOverrides: RateLimitOverrides,
  ) {}

  /**
   * Reads without counting: whether `amount` more would fit right now. Not a
   * reservation -- another request can take the room before the caller acts --
   * so a caller that must not overshoot calls `consume` instead.
   */
  async check(name: string, amount = 1): Promise<QuotaCheck> {
    assertAmount(amount);

    const { period, limit } = await this.resolve(name);
    const used = await this.usedIn(name, periodKey(period));

    return {
      allowed: used + amount <= limit,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  }

  /**
   * Counts `amount` against the quota, or throws without counting anything.
   *
   * The limit is part of the UPDATE's own WHERE clause, so the check and the
   * increment are one statement Postgres serialises on the row: two requests
   * racing for the last unit cannot both win, which a read followed by a write
   * could not promise. The row for a new period is created empty with
   * `skipDuplicates` first (an `ON CONFLICT DO NOTHING`, so racing creators
   * never raise a unique violation, which would abort a surrounding
   * transaction), then the same conditional UPDATE runs again.
   */
  async consume(name: string, amount = 1): Promise<QuotaCheck> {
    assertAmount(amount);

    const { period, limit } = await this.resolve(name);
    const key = periodKey(period);

    let used =
      amount > limit ? null : await this.increment(name, key, amount, limit);

    if (used === null && amount <= limit) {
      await this.prisma.quotaUsage.createMany({
        data: [
          { name, period: key, used: 0 },
        ] as Prisma.QuotaUsageCreateManyInput[],
        skipDuplicates: true,
      });
      used = await this.increment(name, key, amount, limit);
    }

    if (used === null) {
      throw new TenantQuotaExceededException(
        name,
        limit,
        await this.usedIn(name, key),
      );
    }

    return { allowed: true, limit, used, remaining: Math.max(0, limit - used) };
  }

  /** Every declared quota with its figure for the current period. */
  async usage(): Promise<QuotaStatus[]> {
    const declared = Object.entries(this.config.quotas ?? {});

    if (declared.length === 0) {
      return [];
    }

    const [rows, overrides] = await Promise.all([
      this.prisma.quotaUsage.findMany({
        where: {
          OR: declared.map(([name, quota]) => ({
            name,
            period: periodKey(quota.period ?? DEFAULT_PERIOD),
          })),
        },
      }),
      this.prisma.quotaOverride.findMany({
        where: { name: { in: declared.map(([name]) => name) } },
      }),
    ]);

    return declared.map(([name, quota]) => {
      const period = quota.period ?? DEFAULT_PERIOD;
      const key = periodKey(period);
      const override = overrides.find((row) => row.name === name);
      const limit = override?.limit ?? quota.limit;
      const used =
        rows.find((row) => row.name === name && row.period === key)?.used ?? 0;

      return {
        name,
        period,
        periodKey: key,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        overridden: override !== undefined,
      };
    });
  }

  /**
   * Sets, or with `null` removes, the limit of one tenant. Acts on the tenant
   * it is given, not the ambient one, because the caller is an operator
   * adjusting someone else's ceiling. `name` is a declared quota, or
   * `rate-limit:<bucket>` to retune a bucket of the rate-limit guard.
   */
  async setOverride(
    tenantId: string,
    name: string,
    limit: number | null,
  ): Promise<void> {
    this.assertOverridable(name);

    await runInTenant(tenantId, async () => {
      if (limit === null) {
        await this.prisma.quotaOverride.deleteMany({ where: { name } });

        return;
      }

      await this.prisma.quotaOverride.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { name, limit } as Prisma.QuotaOverrideUncheckedCreateInput,
        update: { limit },
      });
    });

    this.rateLimitOverrides.forget(tenantId);
  }

  private async resolve(
    name: string,
  ): Promise<{ period: HeryConfigQuotaPeriod; limit: number }> {
    const quota = this.declared(name);
    const override = await this.prisma.quotaOverride.findFirst({
      where: { name },
      select: { limit: true },
    });

    return {
      period: quota.period ?? DEFAULT_PERIOD,
      limit: override?.limit ?? quota.limit,
    };
  }

  private declared(name: string): HeryConfigQuota {
    const quota = this.config.quotas?.[name];

    if (!quota) {
      throw new QuotaNotDeclaredException(name);
    }

    return quota;
  }

  private assertOverridable(name: string): void {
    const isRateLimit =
      name.startsWith(RATE_LIMIT_OVERRIDE_PREFIX) &&
      name.length > RATE_LIMIT_OVERRIDE_PREFIX.length;

    if (!isRateLimit) {
      this.declared(name);
    }
  }

  private async increment(
    name: string,
    period: string,
    amount: number,
    limit: number,
  ): Promise<number | null> {
    const rows = await this.prisma.quotaUsage.updateManyAndReturn({
      where: { name, period, used: { lte: limit - amount } },
      data: { used: { increment: amount } },
      select: { used: true },
    });

    return rows[0]?.used ?? null;
  }

  private async usedIn(name: string, period: string): Promise<number> {
    const row = await this.prisma.quotaUsage.findFirst({
      where: { name, period },
      select: { used: true },
    });

    return row?.used ?? 0;
  }
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new RangeError(`A quota amount is a positive integer, got ${amount}`);
  }
}
