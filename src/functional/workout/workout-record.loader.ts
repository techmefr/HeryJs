import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import type { RecordLoader } from '../../technical/capabilities/capability-check';
import type { WorkoutRecordLike } from './workout.policy';

export const WORKOUT_RECORD_LOADER = Symbol('WORKOUT_RECORD_LOADER');

@Injectable()
export class WorkoutRecordLoader implements RecordLoader<WorkoutRecordLike> {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    return this.prisma.workout.findUnique({ where: { id } });
  }
}
