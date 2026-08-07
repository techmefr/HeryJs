import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { PageQuery } from '#technical/http/page-query';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
    if (tenantId) {
      const tenantFlag = await this.prisma.featureFlag.findUnique({
        where: { key_tenantId: { key, tenantId } },
      });

      if (tenantFlag) {
        return tenantFlag.enabled;
      }
    }

    const globalFlag = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId: null },
    });

    return globalFlag?.enabled ?? false;
  }

  list(tenantId?: string) {
    return this.prisma.featureFlag.findMany({
      where: tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {},
      orderBy: { key: 'asc' },
    });
  }

  async listAll(page: PageQuery) {
    const [records, total] = await Promise.all([
      this.prisma.featureFlag.findMany({
        // key is unique per tenant, so it is already a stable order on its own.
        orderBy: [{ key: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.featureFlag.count(),
    ]);

    return { records, total };
  }

  async set(key: string, enabled: boolean, tenantId?: string) {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId: tenantId ?? null },
    });

    if (existing) {
      return this.prisma.featureFlag.update({
        where: { id: existing.id },
        data: { enabled },
      });
    }

    return this.prisma.featureFlag.create({
      data: { key, tenantId: tenantId ?? null, enabled },
    });
  }
}
