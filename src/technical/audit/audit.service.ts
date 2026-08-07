import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PageQuery } from '#technical/http/page-query';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { auditEntryPayload, GENESIS_PREVIOUS_HASH } from './audit-log';
import { canonicalJson } from './canonical-json';

// How many entries verifyChain holds at once. The chain has to be walked whole
// -- every entry's hash depends on the one before it -- but it does not have to
// be in memory whole, and a tenant with a year of writes would not fit.
const VERIFY_BATCH_SIZE = 1000;

@Injectable()
export class AuditService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async page(tenantId: string, page: PageQuery) {
    const where = { tenantId };

    const [records, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { sequence: 'asc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { records, total };
  }

  async verifyChain(tenantId: string): Promise<boolean> {
    let previousHash: string = GENESIS_PREVIOUS_HASH;
    let after = 0;

    for (;;) {
      const entries = await this.prisma.auditLog.findMany({
        where: { tenantId, sequence: { gt: after } },
        orderBy: { sequence: 'asc' },
        take: VERIFY_BATCH_SIZE,
      });

      if (entries.length === 0) {
        return true;
      }

      for (const entry of entries) {
        const expectedHash: string = createHash('sha256')
          .update(previousHash)
          .update(
            canonicalJson(
              auditEntryPayload({
                tenantId: entry.tenantId,
                model: entry.model,
                operation: entry.operation,
                recordId: entry.recordId,
                data: entry.data,
                userId: entry.userId,
                impersonatedBy: entry.impersonatedBy,
              }),
            ),
          )
          .digest('hex');

        if (
          entry.previousHash !== previousHash ||
          entry.hash !== expectedHash
        ) {
          return false;
        }

        previousHash = entry.hash;
        after = entry.sequence;
      }
    }
  }
}
