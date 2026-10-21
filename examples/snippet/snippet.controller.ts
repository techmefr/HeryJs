import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Snippet } from '@prisma/client';
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
import { CacheableRead } from '#technical/http/etag.decorator';
import {
  ifMatchVersionOf,
  resolveExpectedVersion,
} from '#technical/http/record-version';
import {
  nextCursorFor,
  parseSearchRequest,
  searchRequestSchema,
  withIncludesAndAggregates,
} from '#technical/http/list-query';
import type {
  ListQueryContract,
  SearchRequestBody,
} from '#technical/http/list-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  createSnippetRequestSchema,
  createSnippetSchema,
  deleteSnippetRequestSchema,
  restoreSnippetRequestSchema,
  updateSnippetRequestSchema,
  updateSnippetSchema,
} from './snippet.dto';
import type {
  CreateSnippetRequestBody,
  DeleteSnippetRequestBody,
  RestoreSnippetRequestBody,
  UpdateSnippetRequestBody,
} from './snippet.dto';
import {
  canCreateSnippet,
  canDeleteSnippet,
  canDeleteAnySnippet,
  canHardDeleteSnippet,
  canListTrashedSnippet,
  canRestoreSnippet,
  canRestoreAnySnippet,
  canUpdateSnippet,
  canUpdateAnySnippet,
  canViewAnySnippet,
  SnippetPolicy,
} from './snippet.policy';
import { SNIPPET_SIGNAL_CHANNEL, SnippetService } from './snippet.service';
import { SNIPPET_RECORD_LOADER } from './snippet-record.loader';
import type { SnippetRecordLoader } from './snippet-record.loader';
import { toSnippetView } from './snippet.view';

// What the search route accepts, declared once. parseSearchRequest validates
// against this object and GET /describe publishes it, so the endpoint cannot
// advertise a contract it does not honour -- or honour one it never mentions.
// Two literals disagreed on id, which is filterable and used to be missing
// from describe.
const SNIPPET_CONTRACT = {
  sorts: ['createdAt'],
  filters: ['id', 'title'],
  selects: [
    'id',
    'ownerId',
    'title',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'version',
  ],
  includes: {},
  aggregates: {},
  limits: [10, 20],
  defaultLimit: 10,
} as const satisfies ListQueryContract;

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const SNIPPET_DESCRIBE = {
  // Published so a client can tell which contract it is holding without
  // inferring it from the path it happened to call.
  version: 1,
  fields: [{ name: 'title', type: 'string', optional: false }],
  ...SNIPPET_CONTRACT,
  // Stated rather than implied by the absence of limits: a client reading this
  // knows the search route returns every match, and that asking for a page is
  // an error rather than a no-op.
  paginated: true,
  versioned: { field: 'version', header: 'If-Match' },
  rules: {
    create: z.toJSONSchema(createSnippetSchema),
    update: z.toJSONSchema(updateSnippetSchema),
  },
};

@Controller('snippets')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class SnippetController {
  constructor(
    private readonly snippets: SnippetService,
    private readonly policy: SnippetPolicy,
    @Inject(SNIPPET_RECORD_LOADER)
    private readonly loader: SnippetRecordLoader,
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
      | { index: number; id: string; ok: true; record: Snippet }
      | { index: number; id: string; ok: false; error: ResolvedError }
    > = [];

    for (const [index, id] of ids.entries()) {
      const record = await this.loader.load(id);

      if (!record) {
        entries.push({
          index,
          id,
          ok: false,
          error: resolveDomainError(new RecordNotFoundException('snippet')),
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
  @Capability(canViewAnySnippet)
  @CacheableRead()
  async search(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, SNIPPET_CONTRACT);
    const subject = subjectOf(req.user);

    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashedSnippet(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }

    const { records, total, matches } = await this.snippets.search(
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
    const pageLimit = query.limit ?? 10;
    const meta = {
      channels: [SNIPPET_SIGNAL_CHANNEL],
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
            project(toSnippetView(record)),
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
            project(toSnippetView(record)),
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
  @Capability(canViewAnySnippet)
  @CacheableRead()
  describe() {
    return ok(SNIPPET_DESCRIBE);
  }

  @Post('create')
  @Capability(canCreateSnippet)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createSnippetRequestSchema))
    body: CreateSnippetRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const results = [];

    for (const [index, item] of body.data.entries()) {
      try {
        const created = await this.snippets.create(subject, item);
        results.push({
          index,
          status: 'ok' as const,
          data: toSnippetView(created),
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
  @Capability(canUpdateAnySnippet)
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(updateSnippetRequestSchema))
    body: UpdateSnippetRequestBody,
    @Headers('if-match') ifMatch?: string,
  ) {
    const subject = subjectOf(req.user);
    const ifMatchVersion = ifMatchVersionOf(ifMatch, body.data.length);
    const loaded = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      (s, record) => canUpdateSnippet(s, record as never),
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

      const { id: _id, version, ...data } = body.data[index]!;

      try {
        const expected = resolveExpectedVersion(
          'snippet',
          version,
          ifMatchVersion,
        );
        const updated = await this.snippets.update(
          entry.record,
          data,
          expected,
        );
        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: { ...toSnippetView(updated) },
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
  @Capability(canDeleteAnySnippet)
  async remove(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(deleteSnippetRequestSchema))
    body: DeleteSnippetRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>
      canDeleteSnippet(s, record as never),
    );

    if (body.mode === 'hard') {
      const hardDecision = canHardDeleteSnippet(subject);

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
          await this.snippets.hardDelete(entry.record);
          results.push({
            index,
            id: entry.id,
            status: 'ok' as const,
            data: null,
          });
        } else {
          const removed = await this.snippets.softDelete(entry.record);
          results.push({
            index,
            id: entry.id,
            status: 'ok' as const,
            data: toSnippetView(removed),
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

  // A route rather than a service method alone: restore is the only way back
  // from the delete route, and a bin nobody can reach over HTTP is a bin that
  // silently becomes a leak of storage nobody audits. It is gated by the
  // delete preset, not the update one -- see canRestoreSnippet.
  @Post('restore')
  @Capability(canRestoreAnySnippet)
  async restore(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(restoreSnippetRequestSchema))
    body: RestoreSnippetRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>
      canRestoreSnippet(s, record as never),
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
          throw new AlreadyRestoredException('snippet');
        }

        const restored = await this.snippets.restore(entry.record, body.patch);
        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: toSnippetView(restored),
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
