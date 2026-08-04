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
import type { Workout } from '@prisma/client';
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
} from '#technical/http/list-query';
import type { SearchRequestBody } from '#technical/http/list-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  createWorkoutRequestSchema,
  createWorkoutSchema,
  deleteWorkoutRequestSchema,
  restoreWorkoutRequestSchema,
  updateWorkoutRequestSchema,
  updateWorkoutSchema,
} from './workout.dto';
import type {
  CreateWorkoutRequestBody,
  DeleteWorkoutRequestBody,
  RestoreWorkoutRequestBody,
  UpdateWorkoutRequestBody,
} from './workout.dto';
import {
  canCreateWorkout,
  canDeleteWorkout,
  canDeleteAnyWorkout,
  canHardDeleteWorkout,
  canListTrashedWorkout,
  canRestoreWorkout,
  canRestoreAnyWorkout,
  canUpdateWorkout,
  canUpdateAnyWorkout,
  canViewAnyWorkout,
  WorkoutPolicy,
} from './workout.policy';
import { WORKOUT_SIGNAL_CHANNEL, WorkoutService } from './workout.service';
import { WORKOUT_RECORD_LOADER } from './workout-record.loader';
import type { WorkoutRecordLoader } from './workout-record.loader';
import { toWorkoutView } from './workout.view';

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const WORKOUT_DESCRIBE = {
  fields: [{ name: 'title', type: 'string', optional: false }],
  sorts: ['createdAt'],
  filters: [],
  selects: ['id', 'ownerId', 'title', 'createdAt', 'updatedAt', 'deletedAt'],
  limits: [10, 15, 20],
  defaultLimit: 15,
  rules: {
    create: z.toJSONSchema(createWorkoutSchema),
    update: z.toJSONSchema(updateWorkoutSchema),
  },
};

@Controller('workouts')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class WorkoutController {
  constructor(
    private readonly workouts: WorkoutService,
    private readonly policy: WorkoutPolicy,
    @Inject(WORKOUT_RECORD_LOADER)
    private readonly loader: WorkoutRecordLoader,
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
      | { index: number; id: string; ok: true; record: Workout }
      | { index: number; id: string; ok: false; error: ResolvedError }
    > = [];

    for (const [index, id] of ids.entries()) {
      const record = await this.loader.load(id);

      if (!record) {
        entries.push({
          index,
          id,
          ok: false,
          error: resolveDomainError(new RecordNotFoundException('workout')),
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
  @Capability(canViewAnyWorkout)
  async search(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, {
      sorts: ['createdAt'],
      filters: ['id'],
      selects: [
        'id',
        'ownerId',
        'title',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ],
      limits: [10, 15, 20],
      defaultLimit: 15,
    });
    const subject = subjectOf(req.user);

    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashedWorkout(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }

    const { records, total } = await this.workouts.search(subject, query);
    const capabilities = body.capabilities ?? [];
    const select = query.select;
    const project = (view: Record<string, unknown>) =>
      select
        ? Object.fromEntries(
            Object.entries(view).filter(([key]) => key in select),
          )
        : view;
    const meta = {
      channels: [WORKOUT_SIGNAL_CHANNEL],
      page: query.page,
      limit: query.limit,
      total,
      last_page: Math.max(1, Math.ceil(total / query.limit)),
    };

    if (capabilities.length === 0) {
      return ok(
        records.map((record) => project(toWorkoutView(record))),
        meta,
      );
    }

    return ok(
      records.map((record) => {
        const resolved = this.policy.recordCapabilities(subject, record);
        return {
          ...project(toWorkoutView(record)),
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
  @Capability(canViewAnyWorkout)
  describe() {
    return ok(WORKOUT_DESCRIBE);
  }

  @Post('create')
  @Capability(canCreateWorkout)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createWorkoutRequestSchema))
    body: CreateWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const results = [];

    for (const [index, item] of body.data.entries()) {
      try {
        const created = await this.workouts.create(subject, item);
        results.push({
          index,
          status: 'ok' as const,
          data: toWorkoutView(created),
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
  @Capability(canUpdateAnyWorkout)
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(updateWorkoutRequestSchema))
    body: UpdateWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      (s, record) => canUpdateWorkout(s, record as never),
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

      const { id: _id, ...data } = body.data[index]!;

      try {
        const updated = await this.workouts.update(entry.record, data);
        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: toWorkoutView(updated),
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
  @Capability(canDeleteAnyWorkout)
  async remove(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(deleteWorkoutRequestSchema))
    body: DeleteWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>
      canDeleteWorkout(s, record as never),
    );

    if (body.mode === 'hard') {
      const hardDecision = canHardDeleteWorkout(subject);

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
          await this.workouts.hardDelete(entry.record);
          results.push({
            index,
            id: entry.id,
            status: 'ok' as const,
            data: null,
          });
        } else {
          const removed = await this.workouts.softDelete(entry.record);
          results.push({
            index,
            id: entry.id,
            status: 'ok' as const,
            data: toWorkoutView(removed),
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
  @Capability(canRestoreAnyWorkout)
  async restore(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(restoreWorkoutRequestSchema))
    body: RestoreWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>
      canRestoreWorkout(s, record as never),
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
          throw new AlreadyRestoredException('workout');
        }

        const restored = await this.workouts.restore(entry.record, body.patch);
        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: toWorkoutView(restored),
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
