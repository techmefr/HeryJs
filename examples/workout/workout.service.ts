import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma, Workout } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { scopeWhereFor } from '#technical/capabilities/scope-where';
import { SignalService } from '#technical/signal/signal.service';
import { buildTextSearchWhere } from '#technical/search/text-search';
import { SEARCH_DRIVER } from '#technical/search/search-driver';
import type { SearchDriver } from '#technical/search/search-driver';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CreateWorkoutInput, UpdateWorkoutInput } from './workout.dto';

const SEARCHABLE_FIELDS = ['title'] as const;
const SEARCH_COLLECTION = 'workout';

export interface WorkoutSearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: Record<string, string>;
  search?: string;
  limit?: number;
}

export const WORKOUT_SIGNAL_CHANNEL = 'workout';

@Injectable()
export class WorkoutService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
    @Optional()
    @Inject(SEARCH_DRIVER)
    private readonly searchDriver?: SearchDriver,
  ) {}

  private notify() {
    void this.signal.publish(
      `${TenantContextStorage.getTenantId()}:${WORKOUT_SIGNAL_CHANNEL}`,
    );
  }

  private async syncSearchIndex(record: Workout) {
    if (!this.searchDriver) {
      return;
    }

    if (record.deletedAt) {
      await this.searchDriver.remove(SEARCH_COLLECTION, record.id);
      return;
    }

    const document = Object.fromEntries(
      SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
    );
    await this.searchDriver.index(SEARCH_COLLECTION, record.id, document);
  }

  async search(subject: CapabilitySubject, options: WorkoutSearchOptions = {}) {
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    const searchWhere = options.search
      ? this.searchDriver
        ? {
            id: {
              in: await this.searchDriver.search(
                SEARCH_COLLECTION,
                options.search,
                SEARCHABLE_FIELDS,
              ),
            },
          }
        : buildTextSearchWhere(options.search, SEARCHABLE_FIELDS)
      : undefined;

    // The scope clause sits in its own AND branch so a declared filter can
    // never widen it back, whatever the caller passes in the query string.
    return this.prisma.workout.findMany({
      where: {
        AND: [
          scopeWhereFor('own', subject),
          trashedWhere,
          { ...options.filters, ...searchWhere },
        ],
      },
      orderBy: options.sort
        ? { [options.sort.field]: options.sort.direction }
        : { createdAt: 'desc' },
      take: options.limit,
    });
  }

  async create(subject: CapabilitySubject, data: CreateWorkoutInput) {
    const record = await this.prisma.workout.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...data,
        ownerId: subject.id,
      } as unknown as Prisma.WorkoutCreateInput,
    });
    this.notify();
    await this.syncSearchIndex(record);
    return record;
  }

  async update(record: Workout, data: UpdateWorkoutInput) {
    const updated = await this.prisma.workout.update({
      where: { id: record.id },
      data,
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async softDelete(record: Workout) {
    const updated = await this.prisma.workout.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async restore(record: Workout) {
    const updated = await this.prisma.workout.update({
      where: { id: record.id },
      data: { deletedAt: null },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }
}
