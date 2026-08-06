import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, BlogPost } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { scopeWhereFor } from '#technical/capabilities/scope-where';
import { SignalService } from '#technical/signal/signal.service';
import { SearchEngineRegistry } from '#technical/search/search-engine.registry';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { resolveRelationInstructions } from '#technical/http/relation-resolver';
import type { PrismaRelationClient } from '#technical/http/relation-resolver';
import type { RelationInstruction } from '#technical/http/list-query';
import { applyRelationMutation } from '#technical/http/relation-mutations';
import type { PivotDelegate } from '#technical/http/relation-mutations';
import {
  CreateBlogPostInput,
  RelationMutationInput,
  UpdateBlogPostInput,
} from './blog-post.dto';

const SEARCHABLE_FIELDS = ['title'] as const;
const SEARCH_COLLECTION = 'blog-post';

export interface BlogPostSearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
  sorts?: { field: string; direction: 'asc' | 'desc' }[];
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  relationInstructions?: RelationInstruction[];
  search?: string;
  searchEngine?: string;
  page?: number;
  limit?: number;
}

export const BLOG_POST_SIGNAL_CHANNEL = 'blogPost';

@Injectable()
export class BlogPostService {
  private readonly logger = new Logger(BlogPostService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
    private readonly searchEngines: SearchEngineRegistry,
  ) {}

  private notify() {
    void this.signal.publish(
      `${TenantContextStorage.getTenantId()}:${BLOG_POST_SIGNAL_CHANNEL}`,
    );
  }

  // A search engine that is down must not turn into a failed write: the
  // Prisma call above this already committed, so the record is durable
  // either way. Losing the index update for one record is recoverable
  // (hery search:reindex backfills it); returning a 500 for a write that
  // actually succeeded is not. Every declared non-Prisma engine gets synced,
  // not just one -- search[engine] lets a later request read through any of
  // them, so a write has to reach all of them, and one engine being down
  // must not stop the others from getting the update.
  private async syncSearchIndex(record: BlogPost) {
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

  async search(
    subject: CapabilitySubject,
    options: BlogPostSearchOptions = {},
  ) {
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    const searchWhere = options.search
      ? {
          id: {
            in: await this.searchEngines
              .resolve(
                options.searchEngine ?? this.searchEngines.defaultKeyword,
              )
              .search(
                SEARCH_COLLECTION,
                options.search,
                SEARCHABLE_FIELDS,
                TenantContextStorage.getTenantId(),
              ),
          },
        }
      : undefined;

    // The scope clause sits in its own AND branch so a declared filter can
    // never widen it back, whatever the caller passes in the query string.
    const where = {
      AND: [
        scopeWhereFor('own', subject),
        trashedWhere,
        ...(options.where ? [options.where] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    };

    const page = options.page ?? 1;
    const limit = options.limit;

    const [records, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy:
          options.sorts && options.sorts.length > 0
            ? options.sorts.map((sort) => ({ [sort.field]: sort.direction }))
            : { createdAt: 'desc' },
        skip: limit ? (page - 1) * limit : undefined,
        take: limit,
        include: options.include as Prisma.BlogPostInclude | undefined,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    await resolveRelationInstructions(
      this.prisma as unknown as PrismaRelationClient,
      records,
      options.relationInstructions,
    );

    return { records, total };
  }

  async create(subject: CapabilitySubject, data: CreateBlogPostInput) {
    const record = await this.prisma.blogPost.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...data,
        ownerId: subject.id,
      } as unknown as Prisma.BlogPostCreateInput,
    });
    this.notify();
    await this.syncSearchIndex(record);
    return record;
  }

  async update(record: BlogPost, data: UpdateBlogPostInput) {
    const updated = await this.prisma.blogPost.update({
      where: { id: record.id },
      data,
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async syncTags(record: BlogPost, input: RelationMutationInput) {
    return applyRelationMutation(
      this.prisma.blogPostTag as unknown as PivotDelegate,
      'blogPostId',
      'tagId',
      record.id,
      input,
    );
  }

  async softDelete(record: BlogPost) {
    const updated = await this.prisma.blogPost.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async restore(record: BlogPost, patch?: UpdateBlogPostInput) {
    const updated = await this.prisma.blogPost.update({
      where: { id: record.id },
      data: { ...patch, deletedAt: null },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  // Distinct from softDelete: this removes the row rather than flagging it,
  // and is reached only once the caller already holds the separate hard-delete
  // capability. Runs on the same tenant-scoped client as every other write, so
  // the audit extension records it exactly like any other audited delete.
  async hardDelete(record: BlogPost) {
    await this.prisma.blogPost.delete({ where: { id: record.id } });
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
  async purge(record: BlogPost) {
    await writeAuditLog(authPrismaClient, {
      tenantId: record.tenantId,
      model: 'BlogPost',
      operation: 'purge',
      recordId: record.id,
      data: {},
      userId: TenantContextStorage.getUserId(),
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    });
    await authPrismaClient.blogPost.delete({
      where: { id: record.id, tenantId: record.tenantId },
    });
    this.notify();
    await this.removeFromSearchIndex(record.id, record.tenantId);
  }
}
