import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { BlogPost } from '@prisma/client';
import { z } from 'zod';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { subjectOf } from '#technical/capabilities/subject';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { AlreadyRestoredException } from '#technical/errors/already-restored.exception';
import { resolveDomainError } from '#technical/errors/domain-exception.filter';
import type { ResolvedError } from '#technical/errors/domain-exception.filter';
import { ok } from '#technical/http/envelope';
import {
  parseSearchRequest,
  searchRequestSchema,
  withIncludesAndAggregates,
} from '#technical/http/list-query';
import type { SearchRequestBody } from '#technical/http/list-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  createBlogPostRequestSchema,
  createBlogPostSchema,
  deleteBlogPostRequestSchema,
  restoreBlogPostRequestSchema,
  updateBlogPostRequestSchema,
  updateBlogPostSchema,
} from './blog-post.dto';
import type {
  CreateBlogPostRequestBody,
  DeleteBlogPostRequestBody,
  RestoreBlogPostRequestBody,
  UpdateBlogPostRequestBody,
} from './blog-post.dto';
import {
  canAttachTagsToBlogPost,
  canCreateBlogPost,
  canDeleteBlogPost,
  canDeleteAnyBlogPost,
  canDetachTagsFromBlogPost,
  canHardDeleteBlogPost,
  canListTrashedBlogPost,
  canRestoreBlogPost,
  canRestoreAnyBlogPost,
  canUpdateBlogPost,
  canUpdateAnyBlogPost,
  canViewAnyBlogPost,
  BlogPostPolicy,
} from './blog-post.policy';
import { BLOG_POST_SIGNAL_CHANNEL, BlogPostService } from './blog-post.service';
import { BLOG_POST_RECORD_LOADER } from './blog-post-record.loader';
import type { BlogPostRecordLoader } from './blog-post-record.loader';
import { toBlogPostView } from './blog-post.view';

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const BLOG_POST_DESCRIBE = {
  fields: [{ name: 'title', type: 'string', optional: false }],
  sorts: ['createdAt'],
  filters: ['title'],
  selects: ['id', 'ownerId', 'title', 'createdAt', 'updatedAt', 'deletedAt'],
  includes: {
    notes: {
      type: 'hasMany',
      foreignKey: 'blogPostId',
      childDelegate: 'blogPostNote',
      filters: ['body'],
      sorts: ['createdAt'],
      selects: ['id', 'body', 'rating', 'createdAt'],
    },
    comments: {
      type: 'morphMany',
      foreignKey: 'commentableId',
      discriminator: 'commentableType',
      discriminatorValue: 'BlogPost',
      childDelegate: 'comment',
      filters: ['body'],
      sorts: ['createdAt'],
      selects: ['id', 'body', 'createdAt'],
    },
  },
  aggregates: {
    notes: {
      type: 'hasMany',
      foreignKey: 'blogPostId',
      childDelegate: 'blogPostNote',
      filters: ['body'],
      fields: ['rating'],
    },
    comments: {
      type: 'morphMany',
      foreignKey: 'commentableId',
      discriminator: 'commentableType',
      discriminatorValue: 'BlogPost',
      childDelegate: 'comment',
      filters: ['body'],
      fields: [],
    },
  },
  limits: [10, 15, 20],
  defaultLimit: 15,
  rules: {
    create: z.toJSONSchema(createBlogPostSchema),
    update: z.toJSONSchema(updateBlogPostSchema),
  },
};

@Controller('blog-posts')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class BlogPostController {
  constructor(
    private readonly blogPosts: BlogPostService,
    private readonly policy: BlogPostPolicy,
    @Inject(BLOG_POST_RECORD_LOADER)
    private readonly loader: BlogPostRecordLoader,
  ) {}

  // Reused by update/delete/restore: each id is loaded and checked on its
  // own, and a missing record or a denied one becomes that id's entry in the
  // batch result rather than aborting every other id in the same request.
  private async loadAndAuthorize(
    ids: string[],
    subject: ReturnType<typeof subjectOf>,
    check: (
      subject: ReturnType<typeof subjectOf>,
      record: unknown,
    ) => { allowed: boolean },
  ) {
    const entries: Array<
      | { index: number; id: string; ok: true; record: BlogPost }
      | { index: number; id: string; ok: false; error: ResolvedError }
    > = [];

    for (const [index, id] of ids.entries()) {
      const record = await this.loader.load(id);

      if (!record) {
        entries.push({
          index,
          id,
          ok: false,
          error: resolveDomainError(new RecordNotFoundException('blog-post')),
        });
        continue;
      }

      const decision = check(subject, record);

      if (!decision.allowed) {
        entries.push({
          index,
          id,
          ok: false,
          error: resolveDomainError(new CapabilityForbiddenException(decision)),
        });
        continue;
      }

      entries.push({ index, id, ok: true, record });
    }

    return entries;
  }

  @Post('search')
  @HttpCode(200)
  @Capability(canViewAnyBlogPost)
  async search(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, {
      sorts: ['createdAt'],
      filters: ['id', 'title'],
      selects: [
        'id',
        'ownerId',
        'title',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ],
      includes: {
        notes: {
          type: 'hasMany',
          foreignKey: 'blogPostId',
          childDelegate: 'blogPostNote',
          filters: ['body'],
          sorts: ['createdAt'],
          selects: ['id', 'body', 'rating', 'createdAt'],
        },
        comments: {
          type: 'morphMany',
          foreignKey: 'commentableId',
          discriminator: 'commentableType',
          discriminatorValue: 'BlogPost',
          childDelegate: 'comment',
          filters: ['body'],
          sorts: ['createdAt'],
          selects: ['id', 'body', 'createdAt'],
        },
      },
      aggregates: {
        notes: {
          type: 'hasMany',
          foreignKey: 'blogPostId',
          childDelegate: 'blogPostNote',
          filters: ['body'],
          fields: ['rating'],
        },
        comments: {
          type: 'morphMany',
          foreignKey: 'commentableId',
          discriminator: 'commentableType',
          discriminatorValue: 'BlogPost',
          childDelegate: 'comment',
          filters: ['body'],
          fields: [],
        },
      },
      limits: [10, 15, 20],
      defaultLimit: 15,
    });
    const subject = subjectOf(req.user);

    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashedBlogPost(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }

    const { records, total } = await this.blogPosts.search(subject, query);
    const capabilities = body.capabilities ?? [];
    const select = query.select;
    const project = (view: Record<string, unknown>) =>
      select
        ? Object.fromEntries(
            Object.entries(view).filter(([key]) => key in select),
          )
        : view;
    const meta = {
      channels: [BLOG_POST_SIGNAL_CHANNEL],
      page: query.page,
      limit: query.limit,
      total,
      last_page: Math.max(1, Math.ceil(total / query.limit)),
    };

    if (capabilities.length === 0) {
      return ok(
        records.map((record) =>
          withIncludesAndAggregates(
            project(toBlogPostView(record)),
            record,
            query,
          ),
        ),
        meta,
      );
    }

    return ok(
      records.map((record) => {
        const resolved = this.policy.recordCapabilities(subject, record);
        return {
          ...withIncludesAndAggregates(
            project(toBlogPostView(record)),
            record,
            query,
          ),
          capabilities: Object.fromEntries(
            Object.entries(resolved).filter(([key]) =>
              capabilities.includes(key),
            ),
          ),
        };
      }),
      {
        ...meta,
        capabilities: this.policy.metaCapabilities(subject),
      },
    );
  }

  @Get('describe')
  @Capability(canViewAnyBlogPost)
  describe() {
    return ok(BLOG_POST_DESCRIBE);
  }

  @Post('create')
  @Capability(canCreateBlogPost)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createBlogPostRequestSchema))
    body: CreateBlogPostRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const results = [];

    for (const [index, item] of body.data.entries()) {
      try {
        const created = await this.blogPosts.create(subject, item);
        results.push({
          index,
          status: 'ok' as const,
          data: toBlogPostView(created),
        });
      } catch (error) {
        results.push({
          index,
          status: 'error' as const,
          error: resolveDomainError(error),
        });
      }
    }

    return ok(results);
  }

  @Post('update')
  @Capability(canUpdateAnyBlogPost)
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(updateBlogPostRequestSchema))
    body: UpdateBlogPostRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      (s, record) => canUpdateBlogPost(s, record as never),
    );

    const results = [];

    for (const [index, entry] of loaded.entries()) {
      if (!entry.ok) {
        results.push({
          index,
          id: entry.id,
          status: 'error' as const,
          error: entry.error,
        });
        continue;
      }

      const { id: _id, relations, ...data } = body.data[index]!;

      try {
        const updated = await this.blogPosts.update(entry.record, data);
        const relationResults: Record<string, string[]> = {};

        if (relations?.tags) {
          const { attach, detach, sync } = relations.tags;

          if ((attach && attach.length > 0) || sync) {
            const decision = canAttachTagsToBlogPost(subject, entry.record);
            if (!decision.allowed) {
              throw new CapabilityForbiddenException(decision);
            }
          }

          if ((detach && detach.length > 0) || sync) {
            const decision = canDetachTagsFromBlogPost(subject, entry.record);
            if (!decision.allowed) {
              throw new CapabilityForbiddenException(decision);
            }
          }

          relationResults.tags = await this.blogPosts.syncTags(
            entry.record,
            relations.tags,
          );
        }

        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: { ...toBlogPostView(updated), ...relationResults },
        });
      } catch (error) {
        results.push({
          index,
          id: entry.id,
          status: 'error' as const,
          error: resolveDomainError(error),
        });
      }
    }

    return ok(results);
  }

  @Post('delete')
  @Capability(canDeleteAnyBlogPost)
  async remove(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(deleteBlogPostRequestSchema))
    body: DeleteBlogPostRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>
      canDeleteBlogPost(s, record as never),
    );

    if (body.mode === 'hard') {
      const hardDecision = canHardDeleteBlogPost(subject);

      if (!hardDecision.allowed) {
        throw new CapabilityForbiddenException(hardDecision);
      }
    }

    const results = [];

    for (const [index, entry] of loaded.entries()) {
      if (!entry.ok) {
        results.push({
          index,
          id: entry.id,
          status: 'error' as const,
          error: entry.error,
        });
        continue;
      }

      try {
        if (body.mode === 'hard') {
          await this.blogPosts.hardDelete(entry.record);
          results.push({
            index,
            id: entry.id,
            status: 'ok' as const,
            data: null,
          });
        } else {
          const removed = await this.blogPosts.softDelete(entry.record);
          results.push({
            index,
            id: entry.id,
            status: 'ok' as const,
            data: toBlogPostView(removed),
          });
        }
      } catch (error) {
        results.push({
          index,
          id: entry.id,
          status: 'error' as const,
          error: resolveDomainError(error),
        });
      }
    }

    return ok(results);
  }

  @Post('restore')
  @Capability(canRestoreAnyBlogPost)
  async restore(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(restoreBlogPostRequestSchema))
    body: RestoreBlogPostRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>
      canRestoreBlogPost(s, record as never),
    );

    const results = [];

    for (const [index, entry] of loaded.entries()) {
      if (!entry.ok) {
        results.push({
          index,
          id: entry.id,
          status: 'error' as const,
          error: entry.error,
        });
        continue;
      }

      try {
        if (!entry.record.deletedAt) {
          throw new AlreadyRestoredException('blog-post');
        }

        const restored = await this.blogPosts.restore(entry.record, body.patch);
        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: toBlogPostView(restored),
        });
      } catch (error) {
        results.push({
          index,
          id: entry.id,
          status: 'error' as const,
          error: resolveDomainError(error),
        });
      }
    }

    return ok(results);
  }
}
