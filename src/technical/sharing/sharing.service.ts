import { Inject, Injectable } from '@nestjs/common';
import type { RecordShare } from '#technical/capabilities/capabilities.types';
import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import type { GrantShareInput } from './sharing.dto';

/**
 * Bounds the id list a collection scope is widened with. A subject with more
 * shares than this still sees the most recent ones in a list, and every one of
 * them on its own detail route, which does not use this set.
 */
export const MAX_SHARED_IDS = 5000;

export interface ShareView {
  id: string;
  resource: string;
  recordId: string;
  granteeType: 'user' | 'team';
  granteeId: string;
  access: 'read' | 'write';
  grantedById: string;
  createdAt: Date;
}

type RecordWithId = { id: string };

/**
 * Per-record access, resolved without a query per row: a collection fetches
 * the ids shared with the caller once and folds them into its scope filter,
 * and a page of records fetches all of its shares in one query and carries
 * them on the records, so the decision itself stays an in-memory function.
 *
 * Every query runs through the tenant-scoped client, and the table has its own
 * row-level policy, so a share can never be read, matched or revoked from
 * another tenant. Grants and revokes are audited by the Prisma audit layer
 * (RecordShare is in AUDITED_MODELS), with the acting user and any
 * impersonator.
 */
@Injectable()
export class SharingService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  /** Ids of this resource shared with the subject, directly or via a team. */
  async sharedRecordIds(
    resource: string,
    subject: CapabilitySubject,
  ): Promise<string[]> {
    const rows = await this.prisma.recordShare.findMany({
      where: {
        resource,
        OR: [
          { granteeType: 'user', granteeId: subject.id },
          ...(subject.teamIds.length > 0
            ? [{ granteeType: 'team', granteeId: { in: subject.teamIds } }]
            : []),
        ],
      },
      select: { recordId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: MAX_SHARED_IDS,
    });

    return rows.map((row) => row.recordId);
  }

  /** Every record of a page with its shares attached, in one query. */
  async withShares<T extends RecordWithId>(
    resource: string,
    records: T[],
  ): Promise<(T & { shares: RecordShare[] })[]> {
    if (records.length === 0) {
      return [];
    }

    const rows = await this.prisma.recordShare.findMany({
      where: { resource, recordId: { in: records.map((record) => record.id) } },
    });
    const byRecord = new Map<string, RecordShare[]>();

    for (const row of rows) {
      const shares = byRecord.get(row.recordId) ?? [];
      shares.push(asShare(row));
      byRecord.set(row.recordId, shares);
    }

    return records.map((record) => ({
      ...record,
      shares: byRecord.get(record.id) ?? [],
    }));
  }

  async list(resource: string, recordId: string): Promise<ShareView[]> {
    const rows = await this.prisma.recordShare.findMany({
      where: { resource, recordId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(asView);
  }

  /**
   * Granting again to the same user or team changes the access instead of
   * adding a second row. The grantee has to exist inside the caller's tenant:
   * a share naming someone elsewhere would match nobody, so it is refused
   * rather than stored as an inert row that claims otherwise.
   */
  async grant(
    resource: string,
    recordId: string,
    grantedById: string,
    input: GrantShareInput,
  ): Promise<ShareView> {
    await this.assertGranteeInTenant(input);

    const existing = await this.prisma.recordShare.findFirst({
      where: {
        resource,
        recordId,
        granteeType: input.granteeType,
        granteeId: input.granteeId,
      },
    });

    if (existing) {
      return asView(
        await this.prisma.recordShare.update({
          where: { id: existing.id },
          data: { access: input.access, grantedById },
        }),
      );
    }

    return asView(
      await this.prisma.recordShare.create({
        data: {
          resource,
          recordId,
          granteeType: input.granteeType,
          granteeId: input.granteeId,
          access: input.access,
          grantedById,
        } as never,
      }),
    );
  }

  /** Scoped to the record the route named, so another record's share id is not found. */
  async revoke(
    resource: string,
    recordId: string,
    shareId: string,
  ): Promise<ShareView> {
    const share = await this.prisma.recordShare.findFirst({
      where: { id: shareId, resource, recordId },
    });

    if (!share) {
      throw new RecordNotFoundException('share');
    }

    return asView(
      await this.prisma.recordShare.delete({ where: { id: share.id } }),
    );
  }

  private async assertGranteeInTenant(input: GrantShareInput): Promise<void> {
    if (input.granteeType === 'team') {
      // The tenant-scoping extension filters this lookup, so a team of
      // another tenant is simply not found.
      const team = await this.prisma.team.findUnique({
        where: { id: input.granteeId },
      });

      if (!team) {
        throw new RecordNotFoundException('team');
      }

      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.granteeId },
      select: { tenantId: true },
    });

    if (!user || user.tenantId !== TenantContextStorage.getTenantId()) {
      throw new RecordNotFoundException('user');
    }
  }
}

interface ShareRow {
  id: string;
  resource: string;
  recordId: string;
  granteeType: string;
  granteeId: string;
  access: string;
  grantedById: string;
  createdAt: Date;
}

function asShare(row: ShareRow): RecordShare {
  return {
    granteeType: row.granteeType as RecordShare['granteeType'],
    granteeId: row.granteeId,
    access: row.access as RecordShare['access'],
  };
}

function asView(row: ShareRow): ShareView {
  return {
    id: row.id,
    resource: row.resource,
    recordId: row.recordId,
    granteeType: row.granteeType as ShareView['granteeType'],
    granteeId: row.granteeId,
    access: row.access as ShareView['access'],
    grantedById: row.grantedById,
    createdAt: row.createdAt,
  };
}
