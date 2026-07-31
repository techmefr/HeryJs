import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { canonicalJson } from './canonical-json';

@Injectable()
export class AuditService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  list(tenantId: string) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async verifyChain(tenantId: string): Promise<boolean> {
    const entries = await this.list(tenantId);
    let previousHash: string | null = null;

    for (const entry of entries) {
      const expectedHash: string = createHash('sha256')
        .update(previousHash ?? '')
        .update(
          canonicalJson({
            tenantId: entry.tenantId,
            model: entry.model,
            operation: entry.operation,
            recordId: entry.recordId,
            data: entry.data,
          }),
        )
        .digest('hex');

      if (entry.previousHash !== previousHash || entry.hash !== expectedHash) {
        return false;
      }

      previousHash = entry.hash;
    }

    return true;
  }
}
