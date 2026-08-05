import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { RecordLoader } from '#technical/capabilities/capability-check';
import type { BlogPostRecordLike } from './blog-post.policy';

export const BLOG_POST_RECORD_LOADER = Symbol('BLOG_POST_RECORD_LOADER');
export const BLOG_POST_VISIBLE_RECORD_LOADER = Symbol(
  'BLOG_POST_VISIBLE_RECORD_LOADER',
);

// Update/delete/restore all need to find a record regardless of its
// soft-delete state (restore specifically targets trashed rows).
@Injectable()
export class BlogPostRecordLoader implements RecordLoader<BlogPostRecordLike> {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    return this.prisma.blogPost.findUnique({ where: { id } });
  }
}

// Plain reads must not resurface a soft-deleted record as if it still existed.
@Injectable()
export class BlogPostVisibleRecordLoader implements RecordLoader<BlogPostRecordLike> {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    const record = await this.prisma.blogPost.findUnique({ where: { id } });
    return record && !record.deletedAt ? record : null;
  }
}
