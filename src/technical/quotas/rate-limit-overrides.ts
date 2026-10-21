import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { RATE_LIMIT_OVERRIDE_PREFIX } from './quotas.types';

const logger = new Logger('RateLimitOverrides');

const TTL_MS = 30_000;
const MAX_TENANTS = 1_000;

interface CachedOverrides {
  loadedAt: number;
  limits: Map<string, number>;
}

/**
 * The rate-limit guard runs on every request, so it cannot afford a query per
 * request to learn that almost no tenant has an override. A tenant's overrides
 * are read once and kept for thirty seconds in this process: a change made
 * through `QuotasService` is seen at once by the process that made it and
 * within the TTL by the others, which is the staleness a rate limit tolerates
 * and a usage count would not.
 *
 * Failing open is deliberate: when the lookup fails the bucket's configured
 * limit applies, so a database blip cannot turn a tenant's raised ceiling into
 * a refusal, and cannot remove the ceiling either.
 */
@Injectable()
export class RateLimitOverrides {
  private readonly cache = new Map<string, CachedOverrides>();

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async limitFor(bucket: string): Promise<number | undefined> {
    const tenantId = TenantContextStorage.findTenantId();

    if (tenantId === null) {
      return undefined;
    }

    const cached = this.cache.get(tenantId);

    if (cached && Date.now() - cached.loadedAt < TTL_MS) {
      return cached.limits.get(bucket);
    }

    try {
      const rows = await this.prisma.quotaOverride.findMany({
        where: { name: { startsWith: RATE_LIMIT_OVERRIDE_PREFIX } },
        select: { name: true, limit: true },
      });

      if (this.cache.size >= MAX_TENANTS) {
        this.cache.clear();
      }

      const limits = new Map(
        rows.map((row) => [
          row.name.slice(RATE_LIMIT_OVERRIDE_PREFIX.length),
          row.limit,
        ]),
      );
      this.cache.set(tenantId, { loadedAt: Date.now(), limits });

      return limits.get(bucket);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`rate limit overrides unreadable: ${message}`);

      return undefined;
    }
  }

  forget(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
