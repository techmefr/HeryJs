import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Workout } from '@prisma/client';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import { CapabilitySubject } from '../../technical/capabilities/capabilities.types';
import { CreateWorkoutInput, UpdateWorkoutInput } from './workout.dto';

export interface WorkoutSearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
}

@Injectable()
export class WorkoutService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async search(options: WorkoutSearchOptions = {}) {
    const where = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    return this.prisma.workout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(subject: CapabilitySubject, data: CreateWorkoutInput) {
    return this.prisma.workout.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        title: data.title,
        ownerId: subject.id,
      } as unknown as Prisma.WorkoutCreateInput,
    });
  }

  update(workout: Workout, data: UpdateWorkoutInput) {
    return this.prisma.workout.update({ where: { id: workout.id }, data });
  }

  softDelete(workout: Workout) {
    return this.prisma.workout.update({
      where: { id: workout.id },
      data: { deletedAt: new Date() },
    });
  }

  restore(workout: Workout) {
    return this.prisma.workout.update({
      where: { id: workout.id },
      data: { deletedAt: null },
    });
  }
}
