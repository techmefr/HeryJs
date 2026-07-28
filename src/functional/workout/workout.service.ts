import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import { CapabilitySubject } from '../../technical/capabilities/capabilities.types';
import { CreateWorkoutInput, UpdateWorkoutInput } from './workout.dto';
import { WorkoutPolicy } from './workout.policy';

export interface WorkoutSearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
}

@Injectable()
export class WorkoutService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly policy: WorkoutPolicy,
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

  async findOneOrFail(id: string) {
    const workout = await this.prisma.workout.findUnique({ where: { id } });

    if (!workout || workout.deletedAt) {
      throw new NotFoundException('Workout not found');
    }

    return workout;
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

  async update(
    subject: CapabilitySubject,
    id: string,
    data: UpdateWorkoutInput,
  ) {
    const workout = await this.findOneOrFail(id);
    const decision = this.policy.recordCapabilities(subject, workout).update;

    if (!decision.allowed) {
      throw new ForbiddenException({ capability: decision });
    }

    return this.prisma.workout.update({ where: { id }, data });
  }

  async softDelete(subject: CapabilitySubject, id: string) {
    const workout = await this.findOneOrFail(id);
    const decision = this.policy.recordCapabilities(subject, workout).delete;

    if (!decision.allowed) {
      throw new ForbiddenException({ capability: decision });
    }

    return this.prisma.workout.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(subject: CapabilitySubject, id: string) {
    const workout = await this.prisma.workout.findUnique({ where: { id } });

    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    const decision = this.policy.recordCapabilities(subject, workout).update;

    if (!decision.allowed) {
      throw new ForbiddenException({ capability: decision });
    }

    return this.prisma.workout.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
