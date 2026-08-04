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
import { z } from 'zod';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { subjectOf } from '#technical/capabilities/subject';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { AlreadyRestoredException } from '#technical/errors/already-restored.exception';
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

  // Reused by update/delete/restore: each loads every targeted record, then
  // fails the whole call on the first one that does not exist or is denied,
  // rather than applying the operation to some and silently skipping others.
  private async loadAndAuthorize(
    ids: string[],
    subject: ReturnType<typeof subjectOf>,
    check: (
      subject: ReturnType<typeof subjectOf>,
      record: unknown,
    ) => { allowed: boolean },
  ) {
    const records = [];

    for (const id of ids) {
      const record = await this.loader.load(id);

      if (!record) {
        throw new RecordNotFoundException('workout');
      }

      const decision = check(subject, record);

      if (!decision.allowed) {
        throw new CapabilityForbiddenException(decision);
      }

      records.push(record);
    }

    return records;
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

    const records = await this.workouts.search(subject, query);
    const capabilities = body.capabilities ?? [];

    if (capabilities.length === 0) {
      return ok(records.map(toWorkoutView), {
        channels: [WORKOUT_SIGNAL_CHANNEL],
      });
    }

    return ok(
      records.map((record) => {
        const resolved = this.policy.recordCapabilities(subject, record);
        return {
          ...toWorkoutView(record),
          capabilities: Object.fromEntries(
            Object.entries(resolved).filter(([key]) =>
              capabilities.includes(key),
            ),
          ),
        };
      }),
      {
        capabilities: this.policy.metaCapabilities(subject),
        channels: [WORKOUT_SIGNAL_CHANNEL],
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
    const created = [];

    for (const item of body.data) {
      created.push(await this.workouts.create(subject, item));
    }

    return ok(created.map(toWorkoutView));
  }

  @Post('update')
  @Capability(canUpdateAnyWorkout)
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(updateWorkoutRequestSchema))
    body: UpdateWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const records = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      (s, record) => canUpdateWorkout(s, record as never),
    );

    const updated = [];

    for (const [index, record] of records.entries()) {
      const { id: _id, ...data } = body.data[index]!;
      updated.push(await this.workouts.update(record, data));
    }

    return ok(updated.map(toWorkoutView));
  }

  @Post('delete')
  @Capability(canDeleteAnyWorkout)
  async remove(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(deleteWorkoutRequestSchema))
    body: DeleteWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const records = await this.loadAndAuthorize(
      body.ids,
      subject,
      (s, record) => canDeleteWorkout(s, record as never),
    );

    if (body.mode === 'hard') {
      const hardDecision = canHardDeleteWorkout(subject);

      if (!hardDecision.allowed) {
        throw new CapabilityForbiddenException(hardDecision);
      }
    }

    if (body.mode === 'hard') {
      for (const record of records) {
        await this.workouts.hardDelete(record);
      }

      return ok([]);
    }

    const removed = [];

    for (const record of records) {
      removed.push(await this.workouts.softDelete(record));
    }

    return ok(removed.map(toWorkoutView));
  }

  @Post('restore')
  @Capability(canUpdateAnyWorkout)
  async restore(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(restoreWorkoutRequestSchema))
    body: RestoreWorkoutRequestBody,
  ) {
    const subject = subjectOf(req.user);
    const records = await this.loadAndAuthorize(
      body.ids,
      subject,
      (s, record) => canUpdateWorkout(s, record as never),
    );

    const restored = [];

    for (const record of records) {
      if (!record.deletedAt) {
        throw new AlreadyRestoredException('workout');
      }

      restored.push(await this.workouts.restore(record, body.patch));
    }

    return ok(restored.map(toWorkoutView));
  }
}
