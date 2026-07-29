import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import type {
  Seeder,
  SeederContext,
  SeederOptions,
} from '../../technical/seeders/seeder.types';
import { workoutFactory } from './workout.factory';

@Injectable()
export class WorkoutSeeder implements Seeder {
  name = 'workouts';
  description = 'Create sample workouts for the current tenant';
  defaultCount = 3;
  maxCount = 100;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async run(context: SeederContext, options?: SeederOptions) {
    const count = options?.count ?? this.defaultCount;

    await this.prisma.workout.createMany({
      data: workoutFactory(
        { ownerId: context.ownerId, tenantId: context.tenantId },
        { count },
      ) as unknown as Prisma.WorkoutCreateManyInput[],
    });

    return { count };
  }
}
