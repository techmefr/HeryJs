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
import { SessionGuard } from '@heryjs/core/auth';
import type { RequestWithUser } from '@heryjs/core/auth';
import { CapabilitiesGuard } from '@heryjs/core/capabilities';
import { subjectOf } from '@heryjs/core/capabilities';
import { Capability, LoadRecordWith } from '@heryjs/core/capabilities';
import { CapabilityForbiddenException } from '@heryjs/core/errors';
import { RecordNotFoundException } from '@heryjs/core/errors';
import { AlreadyRestoredException } from '@heryjs/core/errors';
import { resolveDomainError } from '@heryjs/core/errors';
import type { ResolvedError } from '@heryjs/core/errors';
import { executeBatch } from '@heryjs/core/http';
import type { BatchEntry } from '@heryjs/core/http';
import { ok } from '@heryjs/core/http';
import { CacheableRead } from '@heryjs/core/http';
import {
  nextCursorFor,
  parseSearchRequest,
  searchRequestSchema,
  withIncludesAndAggregates,
  declaredSelect,
} from '@heryjs/core/http';
import type { ListQueryContract, SearchRequestBody } from '@heryjs/core/http';
import { describeLocales } from '@heryjs/core/i18n';
import { describeRichtext } from '@heryjs/core/resources';
import { RICHTEXT_FIELDS } from './blog-post.dto';
import { ZodValidationPipe } from '@heryjs/core/http';
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
  canViewBlogPost,
  canViewAnyBlogPost,
  BlogPostPolicy,
} from './blog-post.policy';
import { BLOG_POST_SIGNAL_CHANNEL, BlogPostService } from './blog-post.service';
import {
  BLOG_POST_RECORD_LOADER,
  BLOG_POST_VISIBLE_RECORD_LOADER,
} from './blog-post-record.loader';
import type { BlogPostRecordLoader } from './blog-post-record.loader';
import { toBlogPostView } from './blog-post.view';
import type { BlogPostView } from './blog-post.view';

// What the search route accepts, declared once. parseSearchRequest validates
// against this object and GET /describe publishes it, so the endpoint cannot
// advertise a contract it does not honour -- or honour one it never mentions.
// Two literals disagreed on id, which is filterable and used to be missing
// from describe.
const BLOG_POST_CONTRACT = {
  sorts: ['createdAt', 'summary'],
  filters: ['id', 'title', 'slug', 'summary'],
  selects: [
    'id',
    'ownerId',
    'title',
    'slug',
    'summary',
    'summaryTranslations',
    'body',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
  translatable: ['summary'],
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
} as const satisfies ListQueryContract;

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const BLOG_POST_DESCRIBE = {
  // Published so a client can tell which contract it is holding without
  // inferring it from the path it happened to call.
  version: 1,
  fields: [
    { name: 'title', type: 'string', optional: false },
    {
      name: 'slug',
      type: 'slug',
      optional: false,
      slug: { source: 'title', stable: false },
    },
    { name: 'summary', type: 'string', optional: true, translatable: true },
    {
      name: 'body',
      type: 'richtext',
      optional: true,
      richtext: describeRichtext(RICHTEXT_FIELDS, 'body'),
    },
    { name: 'privateNote', type: 'encrypted', optional: true },
  ],
  locales: describeLocales(),
  ...BLOG_POST_CONTRACT,
  // Stated rather than implied by the absence of limits: a client reading this
  // knows the search route returns every match, and that asking for a page is
  // an error rather than a no-op.
  paginated: true,
  softDeletes: true,
  // The many-to-many relations the update route can attach to and detach from
  // by id. A client builds its relation controls from this list and reads
  // whether each is allowed from the record's own capabilities, so it neither
  // guesses the relation names nor re-derives who may change them.
  relations: ['tags'],
  // A date has no JSON Schema form, and without this the whole module throws
  // at load for any resource that declares a datetime field. The field list
  // above still says which fields are dates.
  rules: {
    create: z.toJSONSchema(createBlogPostSchema, { unrepresentable: 'any' }),
    update: z.toJSONSchema(updateBlogPostSchema, { unrepresentable: 'any' }),
  },
};

type RequestWithBlogPost = RequestWithUser & { record: BlogPost };

// What `POST /blog-posts/:id/notes/search` accepts --
// the same shape as a resource's own search contract, derived from
// BlogPostNote's blueprint rather than retyped here.
const BLOG_POST_NOTES_CONTRACT = {
  filters: ['id', 'body'],
  sorts: ['createdAt'],
  selects: ['id', 'body', 'rating', 'createdAt'],
  includes: {},
  limits: [5, 10],
  defaultLimit: 5,
} as const satisfies ListQueryContract;

// The picker for a relation asks for candidates by a free-text term; the
// related resource has no search route of its own, so this is the whole contract.
const relationOptionsSchema = z.object({ q: z.string().max(255).optional() });

@Controller('blog-posts')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class BlogPostController {
  constructor(
    private readonly blogPosts: BlogPostService,
    private readonly policy: BlogPostPolicy,
    @Inject(BLOG_POST_RECORD_LOADER)
    private readonly loader: BlogPostRecordLoader,
  ) {}

  private runBatch<T>(entries: BatchEntry<T>[], atomic: boolean) {
    return executeBatch(entries, {
      atomic,
      runAtomically: (callback) => this.blogPosts.atomically(callback),
    });
  }

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
  @CacheableRead()
  async search(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, BLOG_POST_CONTRACT);
    const subject = subjectOf(req.user);

    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashedBlogPost(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }

    const { records, total, matches } = await this.blogPosts.search(
      subject,
      query,
    );
    const capabilities = body.capabilities ?? [];
    const select = query.select;
    const project = (view: Record<string, unknown>) =>
      select
        ? Object.fromEntries(
            Object.entries(view).filter(([key]) => key in select),
          )
        : view;
    const pageLimit = query.limit ?? 15;
    const meta = {
      channels: [BLOG_POST_SIGNAL_CHANNEL],
      page: query.page ?? 1,
      limit: pageLimit,
      last_page: Math.max(1, Math.ceil(total / pageLimit)),
      next_cursor: nextCursorFor(records, query.sorts, pageLimit),
      total,
      ...(matches
        ? {
            search: { matchLimit: matches.limit, truncated: matches.truncated },
          }
        : {}),
    };

    // A truncated match set makes total a floor rather than a count, so the
    // response says which one it is instead of leaving the caller to trust a
    // number that is quietly wrong.
    const messages = matches?.truncated
      ? [
          `Only the first ${matches.limit} full-text matches were counted, and more exist. The totals below are a floor, not a count -- narrow the search term to see the rest.`,
        ]
      : [];

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
        messages,
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
      messages,
    );
  }

  @Get('describe')
  @Capability(canViewAnyBlogPost)
  @CacheableRead()
  describe() {
    return ok(BLOG_POST_DESCRIBE);
  }

  // The parent's own view capability is what gates this route: BlogPostNote
  // has none of its own -- it is routed: false -- so seeing its rows is
  // exactly seeing the blog-post they belong to.
  @Post(':id/notes/search')
  @HttpCode(200)
  @Capability(canViewBlogPost)
  @CacheableRead()
  @LoadRecordWith(BLOG_POST_VISIBLE_RECORD_LOADER, 'blog-post')
  async searchNotes(
    @Req() req: RequestWithBlogPost,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, BLOG_POST_NOTES_CONTRACT);
    const select = query.select ?? declaredSelect(BLOG_POST_NOTES_CONTRACT);
    const { records, total } = await this.blogPosts.searchNotes(req.record.id, {
      ...query,
      select,
    });
    const pageLimit = query.limit ?? 5;
    const meta = {
      page: query.page ?? 1,
      limit: pageLimit,
      last_page: Math.max(1, Math.ceil(total / pageLimit)),
      next_cursor: nextCursorFor(records, query.sorts, pageLimit),
      total,
    };

    return ok(records, meta);
  }

  // Reading who is attached is reading the blog-post, so the view
  // capability gates it; the related resource has no route or capability of
  // its own to ask instead.
  @Post(':id/tags/members')
  @HttpCode(200)
  @Capability(canViewBlogPost)
  @LoadRecordWith(BLOG_POST_VISIBLE_RECORD_LOADER, 'blog-post')
  async membersTags(@Req() req: RequestWithBlogPost) {
    return ok(await this.blogPosts.membersTags(req.record.id));
  }

  // Candidates to attach are offered only to a caller who may attach.
  @Post(':id/tags/options')
  @HttpCode(200)
  @Capability(canAttachTagsToBlogPost)
  @LoadRecordWith(BLOG_POST_VISIBLE_RECORD_LOADER, 'blog-post')
  async optionsTags(
    @Body(new ZodValidationPipe(relationOptionsSchema)) body: { q?: string },
  ) {
    return ok(await this.blogPosts.optionsTags(body.q));
  }

  @Post('create')
  @Capability(canCreateBlogPost)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createBlogPostRequestSchema))
    body: CreateBlogPostRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const entries = body.data.map((item, index): BatchEntry<BlogPostView> => ({
      index,
      run: async () =>
        toBlogPostView(await this.blogPosts.create(subject, item)),
    }));

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
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

    const entries = loaded.map((entry, index): BatchEntry<unknown> => {
      if (!entry.ok) {
        return { index, id: entry.id, failure: entry.error };
      }

      const { id: _id, relations, ...data } = body.data[index]!;

      return {
        index,
        id: entry.id,
        run: async () => {
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

          return { ...toBlogPostView(updated), ...relationResults };
        },
      };
    });

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
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

    const entries = loaded.map(
      (entry, index): BatchEntry<BlogPostView | null> => {
        if (!entry.ok) {
          return { index, id: entry.id, failure: entry.error };
        }

        return {
          index,
          id: entry.id,
          run: async () => {
            if (body.mode === 'hard') {
              await this.blogPosts.hardDelete(entry.record);
              return null;
            }

            return toBlogPostView(
              await this.blogPosts.softDelete(entry.record),
            );
          },
        };
      },
    );

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
  }

  // A route rather than a service method alone: restore is the only way back
  // from the delete route, and a bin nobody can reach over HTTP is a bin that
  // silently becomes a leak of storage nobody audits. It is gated by the
  // delete preset, not the update one -- see canRestoreBlogPost.
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

    const entries = loaded.map((entry, index): BatchEntry<BlogPostView> => {
      if (!entry.ok) {
        return { index, id: entry.id, failure: entry.error };
      }

      return {
        index,
        id: entry.id,
        run: async () => {
          if (!entry.record.deletedAt) {
            throw new AlreadyRestoredException('blog-post');
          }

          return toBlogPostView(
            await this.blogPosts.restore(entry.record, body.patch),
          );
        },
      };
    });

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
  }
}
