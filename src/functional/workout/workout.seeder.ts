import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import type {
  Seeder,
  SeederContext,
} from '../../technical/seeders/seeder.types';
import { workoutFactory } from './workout.factory';

const SEED_COUNT = 3;

@Injectable()
export class WorkoutSeeder implements Seeder {
  name = 'workouts';
  description = 'Create sample workouts for the current tenant';

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async run(context: SeederContext) {
    await this.prisma.workout.createMany({
      data: workoutFactory(
        { ownerId: context.ownerId, tenantId: context.tenantId },
        { count: SEED_COUNT },
      ) as unknown as Prisma.WorkoutCreateManyInput[],
    });

    return { count: SEED_COUNT };
  }
}
