import { Inject, Injectable } from '@nestjs/common';
import { HistoryEntryNotFoundException } from '#technical/errors/history-entry-not-found.exception';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { DEFAULT_HISTORY_PAGE } from './history.schemas';
import type {
  FieldChange,
  HistoryEntry,
  HistoryPage,
  Snapshot,
} from './history.types';
import { diffSnapshots, snapshotOf } from './snapshot';

export interface HistoryDiff {
  from: HistoryEntry;
  to: HistoryEntry | null;
  changes: FieldChange[];
}

/**
 * Reads what the client's history extension stored. RecordSnapshot carries a
 * tenantId but is written outside the tenant extension, the way AuditLog is, so
 * the boundary is stated here in every query instead of being injected: a
 * snapshot from another tenant is never found, even by its exact id.
 */
@Injectable()
export class HistoryService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async list(
    model: string,
    recordId: string,
    query: { limit?: number; before?: number },
  ): Promise<HistoryPage> {
    const limit = query.limit ?? DEFAULT_HISTORY_PAGE;
    const rows = await this.prisma.recordSnapshot.findMany({
      where: {
        tenantId: TenantContextStorage.getTenantId(),
        model,
        recordId,
        ...(query.before === undefined
          ? {}
          : { sequence: { lt: query.before } }),
      },
      orderBy: { sequence: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);

    return {
      entries: page.map((row) => this.entryOf(row)),
      nextBefore:
        rows.length > limit ? (page[page.length - 1]?.sequence ?? null) : null,
    };
  }

  async find(
    model: string,
    recordId: string,
    entryId: string,
  ): Promise<HistoryEntry> {
    const row = await this.prisma.recordSnapshot.findFirst({
      where: {
        id: entryId,
        tenantId: TenantContextStorage.getTenantId(),
        model,
        recordId,
      },
    });

    if (!row) {
      throw new HistoryEntryNotFoundException(model, entryId);
    }

    return this.entryOf(row);
  }

  /**
   * Compares an entry with a later one, or with the record as it is now when
   * no second entry is named. The current side goes through the same column
   * list as a stored snapshot, so a hidden field cannot appear in a diff.
   */
  async diff(
    model: string,
    record: Record<string, unknown> & { id: string },
    fromId: string,
    toId: string | undefined,
  ): Promise<HistoryDiff> {
    const from = await this.find(model, record.id, fromId);
    const to =
      toId === undefined ? null : await this.find(model, record.id, toId);
    const after: Snapshot = to
      ? to.snapshot
      : (snapshotOf(model, record) ?? {});

    return { from, to, changes: diffSnapshots(from.snapshot, after) };
  }

  private entryOf(row: {
    id: string;
    sequence: number;
    operation: string;
    userId: string | null;
    impersonatedBy: string | null;
    createdAt: Date;
    snapshot: unknown;
  }): HistoryEntry {
    return {
      id: row.id,
      sequence: row.sequence,
      operation: row.operation,
      userId: row.userId,
      impersonatedBy: row.impersonatedBy,
      createdAt: row.createdAt,
      snapshot: row.snapshot as Snapshot,
    };
  }
}
