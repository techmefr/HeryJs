import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuditLog } from '@prisma/client';
import type { PageQuery } from '#technical/http/page-query';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  auditEntryPayload,
  GENESIS_PREVIOUS_HASH,
  writeAuditLog,
} from './audit-log';
import { auditWhere } from './audit-filter';
import type { AuditFilter } from './audit-filter';
import { canonicalJson } from './canonical-json';

// How many entries verifyChain holds at once. The chain has to be walked whole
// -- every entry's hash depends on the one before it -- but it does not have to
// be in memory whole, and a tenant with a year of writes would not fit. The
// export reads in the same batches for the same reason.
const VERIFY_BATCH_SIZE = 1000;

export interface ChainVerification {
  valid: boolean;
  checked: number;
  // The first entry whose predecessor or hash does not match, or null when the
  // chain is intact. Naming it is what turns "something was altered" into
  // somewhere to start looking.
  brokenAtSequence: number | null;
  headHash: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async page(tenantId: string, page: PageQuery, filter: AuditFilter = {}) {
    const where = auditWhere(tenantId, filter);

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

  /**
   * The filtered entries in chain order, a batch at a time. Keyset-paged on the
   * sequence rather than skipped, so a long export does not slow down toward
   * its end and an entry written meanwhile cannot shift a page.
   */
  async *exportBatches(
    tenantId: string,
    filter: AuditFilter,
  ): AsyncGenerator<AuditLog[]> {
    const where = auditWhere(tenantId, filter);
    let after = 0;

    for (;;) {
      const entries = await this.prisma.auditLog.findMany({
        where: { ...where, sequence: { gt: after } },
        orderBy: { sequence: 'asc' },
        take: VERIFY_BATCH_SIZE,
      });

      if (entries.length === 0) {
        return;
      }

      yield entries;
      after = entries[entries.length - 1]?.sequence ?? after;
    }
  }

  /**
   * Taking the trail out of the system is itself something the trail records,
   * with who did it and which filter they chose -- a quiet bulk export is the
   * first thing someone covering their tracks would want, and the chain is the
   * one place it cannot be left out.
   */
  async recordExport(
    tenantId: string,
    format: string,
    filter: AuditFilter,
  ): Promise<void> {
    await writeAuditLog(authPrismaClient, {
      tenantId,
      model: 'AuditLog',
      operation: 'export',
      recordId: null,
      data: { format, filter: JSON.parse(JSON.stringify(filter)) as object },
      userId: TenantContextStorage.getUserId(),
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    });
  }

  async verifyChain(tenantId: string): Promise<boolean> {
    return (await this.verify(tenantId)).valid;
  }

  async verify(tenantId: string): Promise<ChainVerification> {
    let previousHash: string = GENESIS_PREVIOUS_HASH;
    let after = 0;
    let checked = 0;

    for (;;) {
      const entries = await this.prisma.auditLog.findMany({
        where: { tenantId, sequence: { gt: after } },
        orderBy: { sequence: 'asc' },
        take: VERIFY_BATCH_SIZE,
      });

      if (entries.length === 0) {
        return {
          valid: true,
          checked,
          brokenAtSequence: null,
          headHash: checked === 0 ? null : previousHash,
        };
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
          return {
            valid: false,
            checked,
            brokenAtSequence: entry.sequence,
            headHash: null,
          };
        }

        previousHash = entry.hash;
        after = entry.sequence;
        checked += 1;
      }
    }
  }
}
