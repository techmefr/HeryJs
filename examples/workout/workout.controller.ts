import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Workout } from '@prisma/client';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { subjectOf } from '#technical/capabilities/subject';
import {
  Capability,
  LoadRecordWith,
} from '#technical/capabilities/capability.decorator';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { ok } from '#technical/http/envelope';
import { parseListQuery } from '#technical/http/list-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { createWorkoutSchema, updateWorkoutSchema } from './workout.dto';
import type { CreateWorkoutInput, UpdateWorkoutInput } from './workout.dto';
import {
  canCreateWorkout,
  canDeleteWorkout,
  canListTrashedWorkout,
  canUpdateWorkout,
  canViewWorkout,
  canViewAnyWorkout,
  WorkoutPolicy,
} from './workout.policy';
import { WORKOUT_SIGNAL_CHANNEL, WorkoutService } from './workout.service';
import {
  WORKOUT_RECORD_LOADER,
  WORKOUT_VISIBLE_RECORD_LOADER,
} from './workout-record.loader';
import { toWorkoutView } from './workout.view';

type RequestWithWorkout = RequestWithUser & { record: Workout };

@Controller('workouts')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class WorkoutController {
  constructor(
    private readonly workouts: WorkoutService,
    private readonly policy: WorkoutPolicy,
  ) {}

  @Get()
  @Capability(canViewAnyWorkout)
  async search(
    @Req() req: RequestWithUser,
    @Query() rawQuery: Record<string, string>,
  ) {
    const { include } = rawQuery;
    const query = parseListQuery(rawQuery, {
      sorts: ['createdAt'],
      filters: [],
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

    if (include !== 'capabilities') {
      return ok(records.map(toWorkoutView), {
        channels: [WORKOUT_SIGNAL_CHANNEL],
      });
    }

    return ok(
      records.map((record) => ({
        ...toWorkoutView(record),
        capabilities: this.policy.recordCapabilities(subject, record),
      })),
      {
        capabilities: this.policy.metaCapabilities(subject),
        channels: [WORKOUT_SIGNAL_CHANNEL],
      },
    );
  }

  @Get(':id')
  @Capability(canViewWorkout)
  @LoadRecordWith(WORKOUT_VISIBLE_RECORD_LOADER)
  findOne(@Req() req: RequestWithWorkout) {
    return ok(toWorkoutView(req.record));
  }

  @Post()
  @Capability(canCreateWorkout)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createWorkoutSchema)) body: CreateWorkoutInput,
  ) {
    const subject = subjectOf(req.user);
    return ok(toWorkoutView(await this.workouts.create(subject, body)));
  }

  @Patch(':id')
  @Capability(canUpdateWorkout)
  @LoadRecordWith(WORKOUT_RECORD_LOADER)
  async update(
    @Req() req: RequestWithWorkout,
    @Body(new ZodValidationPipe(updateWorkoutSchema)) body: UpdateWorkoutInput,
  ) {
    return ok(toWorkoutView(await this.workouts.update(req.record, body)));
  }

  @Delete(':id')
  @Capability(canDeleteWorkout)
  @LoadRecordWith(WORKOUT_RECORD_LOADER)
  async remove(@Req() req: RequestWithWorkout) {
    return ok(toWorkoutView(await this.workouts.softDelete(req.record)));
  }

  @Post(':id/restore')
  @Capability(canUpdateWorkout)
  @LoadRecordWith(WORKOUT_RECORD_LOADER)
  async restore(@Req() req: RequestWithWorkout) {
    return ok(toWorkoutView(await this.workouts.restore(req.record)));
  }
}
