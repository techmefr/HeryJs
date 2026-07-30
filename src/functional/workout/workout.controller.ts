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
import { SessionGuard } from '../../technical/auth/session.guard';
import type { RequestWithUser } from '../../technical/auth/session.guard';
import { CapabilitiesGuard } from '../../technical/capabilities/capabilities.guard';
import {
  Capability,
  LoadRecordWith,
} from '../../technical/capabilities/capability.decorator';
import { ok } from '../../technical/http/envelope';
import { resourceMessage } from '../../technical/http/resource-messages';
import { ZodValidationPipe } from '../../technical/validation/zod-validation.pipe';
import { createWorkoutSchema, updateWorkoutSchema } from './workout.dto';
import type { CreateWorkoutInput, UpdateWorkoutInput } from './workout.dto';
import {
  canCreateWorkout,
  canDeleteWorkout,
  canUpdateWorkout,
  canViewWorkout,
  WorkoutPolicy,
} from './workout.policy';
import { WorkoutService } from './workout.service';
import {
  WORKOUT_RECORD_LOADER,
  WORKOUT_VISIBLE_RECORD_LOADER,
} from './workout-record.loader';

type RequestWithWorkout = RequestWithUser & { record: Workout };

@Controller('workouts')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class WorkoutController {
  constructor(
    private readonly workouts: WorkoutService,
    private readonly policy: WorkoutPolicy,
  ) {}

  @Get()
  async search(
    @Req() req: RequestWithUser,
    @Query('include') include?: string,
    @Query('withTrashed') withTrashed?: string,
    @Query('onlyTrashed') onlyTrashed?: string,
  ) {
    const records = await this.workouts.search({
      withTrashed: withTrashed === 'true',
      onlyTrashed: onlyTrashed === 'true',
    });

    if (include !== 'capabilities') {
      return ok(records);
    }

    const subject = { id: req.user.id, teamIds: [] };

    return ok(
      records.map((record) => ({
        ...record,
        capabilities: this.policy.recordCapabilities(subject, record),
      })),
      { capabilities: this.policy.metaCapabilities() },
    );
  }

  @Get(':id')
  @Capability(canViewWorkout)
  @LoadRecordWith(WORKOUT_VISIBLE_RECORD_LOADER)
  findOne(@Req() req: RequestWithWorkout) {
    return ok(req.record);
  }

  @Post()
  @Capability(canCreateWorkout)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createWorkoutSchema)) body: CreateWorkoutInput,
  ) {
    const subject = { id: req.user.id, teamIds: [] };
    return ok(await this.workouts.create(subject, body), [
      resourceMessage('Workout', 'created'),
    ]);
  }

  @Patch(':id')
  @Capability(canUpdateWorkout)
  @LoadRecordWith(WORKOUT_RECORD_LOADER)
  async update(
    @Req() req: RequestWithWorkout,
    @Body(new ZodValidationPipe(updateWorkoutSchema)) body: UpdateWorkoutInput,
  ) {
    return ok(await this.workouts.update(req.record, body), [
      resourceMessage('Workout', 'updated'),
    ]);
  }

  @Delete(':id')
  @Capability(canDeleteWorkout)
  @LoadRecordWith(WORKOUT_RECORD_LOADER)
  async remove(@Req() req: RequestWithWorkout) {
    return ok(await this.workouts.softDelete(req.record), [
      resourceMessage('Workout', 'deleted'),
    ]);
  }

  @Post(':id/restore')
  @Capability(canUpdateWorkout)
  @LoadRecordWith(WORKOUT_RECORD_LOADER)
  async restore(@Req() req: RequestWithWorkout) {
    return ok(await this.workouts.restore(req.record), [
      resourceMessage('Workout', 'restored'),
    ]);
  }
}
