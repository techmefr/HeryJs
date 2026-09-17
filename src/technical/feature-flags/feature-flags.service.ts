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

  /**
   * Check-then-act, with the database as the referee.
   *
   * Two concurrent calls both pass the findFirst and both reach the create,
   * and for a global flag -- tenantId null -- the schema's @@unique([key,
   * tenantId]) does not stop them: Postgres treats every NULL as distinct, so
   * the pair (key, null) is never equal to itself. The duplicates then made
   * isEnabled() return an arbitrary one of the rows, so the flag's value
   * became nondeterministic rather than wrong in a way anyone would notice.
   *
   * A partial unique index on key WHERE tenantId IS NULL is the constraint
   * that actually holds, and it turns the second insert into a violation
   * instead of a duplicate. Catching it here turns that violation into the
   * update the caller meant, which is what makes the race harmless rather
   * than merely detected.
   */
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

    try {
      return await this.prisma.featureFlag.create({
        data: { key, tenantId: tenantId ?? null, enabled },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // Someone inserted between the read and the write. Their row is the one
      // that exists, so this call becomes the update it would have been had it
      // arrived a moment later.
      const winner = await this.prisma.featureFlag.findFirstOrThrow({
        where: { key, tenantId: tenantId ?? null },
      });

      return this.prisma.featureFlag.update({
        where: { id: winner.id },
        data: { enabled },
      });
    }
  }
}

/**
 * P2002 is Prisma's unique-constraint violation. Matched on the code rather
 * than the message, which is localised and quotes the index name.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}
