import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../../technical/auth/session.guard';
import type { RequestWithUser } from '../../technical/auth/session.guard';
import { ZodValidationPipe } from '../../technical/validation/zod-validation.pipe';
import { createWorkoutSchema, updateWorkoutSchema } from './workout.dto';
import type { CreateWorkoutInput, UpdateWorkoutInput } from './workout.dto';
import { WorkoutPolicy } from './workout.policy';
import { WorkoutService } from './workout.service';

@Controller('workouts')
@UseGuards(SessionGuard)
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
      return { data: records };
    }

    const subject = { id: req.user.id, teamIds: [] };

    return {
      data: records.map((record) => ({
        ...record,
        capabilities: this.policy.recordCapabilities(subject, record),
      })),
      meta: { capabilities: this.policy.metaCapabilities() },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workouts.findOneOrFail(id);
  }

  @Post()
  create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createWorkoutSchema)) body: CreateWorkoutInput,
  ) {
    const subject = { id: req.user.id, teamIds: [] };
    return this.workouts.create(subject, body);
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkoutSchema)) body: UpdateWorkoutInput,
  ) {
    const subject = { id: req.user.id, teamIds: [] };
    return this.workouts.update(subject, id, body);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    const subject = { id: req.user.id, teamIds: [] };
    return this.workouts.softDelete(subject, id);
  }

  @Post(':id/restore')
  restore(@Req() req: RequestWithUser, @Param('id') id: string) {
    const subject = { id: req.user.id, teamIds: [] };
    return this.workouts.restore(subject, id);
  }
}
