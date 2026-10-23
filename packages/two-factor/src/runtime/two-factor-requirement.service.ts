import { Inject, Injectable } from '@nestjs/common';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '#kernel/public/database';
import type { Page, PageQuery } from '#kernel/public/http';

export interface TwoFactorRequirement {
  role: string;
  createdAt: Date;
}

@Injectable()
export class TwoFactorRequirementService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async isRequiredFor(role: string | null): Promise<boolean> {
    if (role === null) {
      return false;
    }

    const requirement = await this.prisma.twoFactorRoleRequirement.findFirst({
      where: { role },
      select: { id: true },
    });

    return requirement !== null;
  }

  async list(page: PageQuery): Promise<Page<TwoFactorRequirement>> {
    const [records, total] = await Promise.all([
      this.prisma.twoFactorRoleRequirement.findMany({
        orderBy: { role: 'asc' },
        skip: page.skip,
        take: page.take,
        select: { role: true, createdAt: true },
      }),
      this.prisma.twoFactorRoleRequirement.count(),
    ]);

    return { records, total };
  }

  async require(tenantId: string, role: string): Promise<void> {
    await this.prisma.twoFactorRoleRequirement.upsert({
      where: { tenantId_role: { tenantId, role } },
      create: { tenantId, role },
      update: {},
    });
  }

  async release(role: string): Promise<void> {
    await this.prisma.twoFactorRoleRequirement.deleteMany({ where: { role } });
  }
}
