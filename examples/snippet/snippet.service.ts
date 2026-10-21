import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, Snippet } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { AmbientTransactionStorage } from '#technical/prisma/transaction-context';
import { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { scopeWhereFor } from '#technical/capabilities/scope-where';
import { env } from '#technical/config/env';
import { SignalService } from '#technical/signal/signal.service';
import { SearchEngineRegistry } from '#technical/search/search-engine.registry';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { resolveRelationInstructions } from '#technical/http/relation-resolver';
import type { PrismaRelationClient } from '#technical/http/relation-resolver';
import { VersionConflictException } from '#technical/errors/version-conflict.exception';
import {
  assertVersionIsCurrent,
  isLostRaceError,
} from '#technical/http/record-version';
import type { ExpectedVersion } from '#technical/http/record-version';
import type { RelationInstruction } from '#technical/http/list-query';
import { CreateSnippetInput, UpdateSnippetInput } from './snippet.dto';
import { SNIPPET_PRESETS } from './snippet.presets';

const SEARCHABLE_FIELDS = ['title'] as const;
const SEARCH_COLLECTION = 'snippet';

export interface SnippetSearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
  sorts?: { field: string; direction: 'asc' | 'desc' }[];
  where?: Record<string, unknown>;
  cursorWhere?: Record<string, unknown>;
  include?: Record<string, unknown>;
  relationInstructions?: RelationInstruction[];
  search?: string;
  searchEngine?: string;
  // null when the resource declares no pagination: every match, no window.
  page?: number | null;
  limit?: number | null;
}

export const SNIPPET_SIGNAL_CHANNEL = 'snippet';

@Injectable()
export class SnippetService {
  private readonly logger = new Logger(SnippetService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
    private readonly searchEngines: SearchEngineRegistry,
  ) {}

  private notify() {
    const channel = `${TenantContextStorage.getTenantId()}:${SNIPPET_SIGNAL_CHANNEL}`;

    void AmbientTransactionStorage.afterCommit(() => {
      void this.signal.publish(channel);
    });
  }

  // A search engine that is down must not turn into a failed write: the
  // Prisma call above this already committed, so the record is durable
  // either way. Losing the index update for one record is recoverable
  // (hery search:reindex backfills it); returning a 500 for a write that
  // actually succeeded is not. Every declared non-Prisma engine gets synced,
  // not just one -- search[engine] lets a later request read through any of
  // them, so a write has to reach all of them, and one engine being down
  // must not stop the others from getting the update.
  private async syncSearchIndex(record: Snippet) {
    await AmbientTransactionStorage.afterCommit(() => this.indexRecord(record));
  }

  private async indexRecord(record: Snippet) {
    if (record.deletedAt) {
      await this.removeFromSearchIndex(record.id, record.tenantId);
      return;
    }

    for (const driver of this.searchEngines.externalDrivers) {
      try {
        const document = Object.fromEntries(
          SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
        );
        await driver.index(
          SEARCH_COLLECTION,
          record.id,
          document,
          record.tenantId,
        );
      } catch (error) {
        this.logger.warn(
          `search index out of sync for ${SEARCH_COLLECTION}:${record.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  // Shared by soft delete (via syncSearchIndex above) and hard delete: a
  // hard-deleted row has no updated record to read deletedAt off, only the
  // id and tenant it used to have.
  private async removeFromSearchIndex(id: string, tenantId: string) {
    await AmbientTransactionStorage.afterCommit(() =>
      this.dropFromIndex(id, tenantId),
    );
  }

  private async dropFromIndex(id: string, tenantId: string) {
    for (const driver of this.searchEngines.externalDrivers) {
      try {
        await driver.remove(SEARCH_COLLECTION, id, tenantId);
      } catch (error) {
        this.logger.warn(
          `search index out of sync for ${SEARCH_COLLECTION}:${id}: ${(error as Error).message}`,
        );
      }
    }
  }

  async search(subject: CapabilitySubject, options: SnippetSearchOptions = {}) {
    // Excluding trashed rows is the default branch, not an opt-in one: a
    // caller that says nothing gets live rows only, so a forgotten flag hides
    // a deleted record rather than resurfacing it.
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    // The matches carry whether the engine had to cut them, which travels back
    // to the caller as a message. A page of 15 out of a capped 1000 out of
    // 40000 real matches is a different answer than a page of 15 out of 1000,
    // and the caller cannot tell them apart unless it is told.
    const matches = options.search
      ? await this.searchEngines
          .resolve(options.searchEngine ?? this.searchEngines.defaultKeyword)
          .search(
            SEARCH_COLLECTION,
            options.search,
            SEARCHABLE_FIELDS,
            TenantContextStorage.getTenantId(),
            env.SEARCH_MATCH_LIMIT,
          )
      : undefined;
    const searchWhere = matches ? { id: { in: matches.ids } } : undefined;

    // The scope clause sits in its own AND branch so a declared filter can
    // never widen it back, whatever the caller passes in the query string.
    const where = {
      AND: [
        scopeWhereFor(SNIPPET_PRESETS.view, subject),
        trashedWhere,
        ...(options.where ? [options.where] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    };

    const page = options.page ?? 1;
    // undefined, never null: Prisma reads an absent take as "every row", which
    // is what a resource with no declared pagination asks for.
    const limit = options.limit ?? undefined;

    const [records, total] = await Promise.all([
      this.prisma.snippet.findMany({
        where: options.cursorWhere
          ? { AND: [where, options.cursorWhere] }
          : where,
        orderBy:
          options.sorts && options.sorts.length > 0
            ? options.sorts.map((sort) => ({ [sort.field]: sort.direction }))
            : { createdAt: 'desc' },
        skip: limit ? (page - 1) * limit : undefined,
        take: limit,
        include: options.include as Prisma.SnippetInclude | undefined,
      }),
      this.prisma.snippet.count({ where }),
    ]);

    await resolveRelationInstructions(
      this.prisma as unknown as PrismaRelationClient,
      records,
      options.relationInstructions,
    );

    return { records, total, matches };
  }

  async create(subject: CapabilitySubject, data: CreateSnippetInput) {
    const record = await this.prisma.snippet.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...data,
        ownerId: subject.id,
      } as unknown as Prisma.SnippetCreateInput,
    });
    this.notify();
    await this.syncSearchIndex(record);
    return record;
  }

  async update(
    record: Snippet,
    data: UpdateSnippetInput,
    expected: ExpectedVersion,
  ) {
    assertVersionIsCurrent('snippet', expected, record.version);

    try {
      const updated = await this.prisma.snippet.update({
        where: { id: record.id, version: expected.value },
        data: { ...data, version: { increment: 1 } },
      });
      this.notify();
      await this.syncSearchIndex(updated);
      return updated;
    } catch (error) {
      if (isLostRaceError(error)) {
        throw new VersionConflictException(
          'snippet',
          expected.value,
          null,
          expected.source,
        );
      }

      throw error;
    }
  }

  /**
   * Stamps deletedAt rather than removing the row, and nothing in this service
   * ever removes it afterwards: prune is what eventually frees the storage.
   * src/technical/prune/prunable-models.ts picks this model up automatically
   * off Prisma's DMMF -- the condition is exactly "has deletedAt and
   * tenantId", which is what the generated model carries -- and
   * PruneService.pruneModel hard-deletes every row whose deletedAt is older
   * than the model's configured retention, writing one audit entry per tenant
   * as it goes. So the two halves compose without either knowing about the
   * other: this one decides a record is gone, prune decides when gone becomes
   * unrecoverable. A resource generated with softDeletes: false has no
   * deletedAt at all and is therefore absent from prunableModels(), which is
   * correct -- its delete already freed the row.
   */
  async softDelete(record: Snippet) {
    const updated = await this.prisma.snippet.update({
      where: { id: record.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async restore(record: Snippet, patch?: UpdateSnippetInput) {
    const updated = await this.prisma.snippet.update({
      where: { id: record.id },
      data: { ...patch, deletedAt: null, version: { increment: 1 } },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  // Distinct from softDelete: this removes the row rather than flagging it,
  // and is reached only once the caller already holds the separate hard-delete
  // capability. Runs on the same tenant-scoped client as every other write, so
  // the audit extension records it exactly like any other audited delete.
  async hardDelete(record: Snippet) {
    await this.prisma.snippet.delete({ where: { id: record.id } });
    this.notify();
    await this.removeFromSearchIndex(record.id, record.tenantId);
  }

  // Distinct from hardDelete: purge is gated by its own capability rather than
  // the delete preset, and the audit entry is written before the row is gone
  // rather than relying on the tenant-scoped client's automatic after-the-fact
  // extension, because a purge is exactly the operation an audit trail exists
  // to prove happened even if the write that follows it never completes. That
  // ordering is why it deletes through the unscoped client -- writing the
  // entry by hand and letting the extension write a second one would fork the
  // chain -- so the tenant travels in the where clause instead: the boundary
  // still applies, it is simply stated rather than injected. A record from
  // another tenant was loaded through the scoped client and cannot reach here,
  // and if one ever did the delete would not match a row.
  async purge(record: Snippet) {
    await writeAuditLog(authPrismaClient, {
      tenantId: record.tenantId,
      model: 'Snippet',
      operation: 'purge',
      recordId: record.id,
      data: {},
      userId: TenantContextStorage.getUserId(),
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    });
    await authPrismaClient.snippet.delete({
      where: { id: record.id, tenantId: record.tenantId },
    });
    this.notify();
    await this.removeFromSearchIndex(record.id, record.tenantId);
  }
}
