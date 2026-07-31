import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, Workout } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { scopeWhereFor } from '#technical/capabilities/scope-where';
import { SignalService } from '#technical/signal/signal.service';
import { SearchEngineRegistry } from '#technical/search/search-engine.registry';
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
  searchEngine?: string;
  limit?: number;
}

export const WORKOUT_SIGNAL_CHANNEL = 'workout';

@Injectable()
export class WorkoutService {
  private readonly logger = new Logger(WorkoutService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
    private readonly searchEngines: SearchEngineRegistry,
  ) {}

  private notify() {
    void this.signal.publish(
      `${TenantContextStorage.getTenantId()}:${WORKOUT_SIGNAL_CHANNEL}`,
    );
  }

  // A search engine that is down must not turn into a failed write: the
  // Prisma call above this already committed, so the record is durable
  // either way. Losing the index update for one record is recoverable
  // (hery search:reindex backfills it); returning a 500 for a write that
  // actually succeeded is not.
  private async syncSearchIndex(record: Workout) {
    const driver = this.searchEngines.externalDriver;

    if (!driver) {
      return;
    }

    try {
      if (record.deletedAt) {
        await driver.remove(SEARCH_COLLECTION, record.id);
        return;
      }

      const document = Object.fromEntries(
        SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
      );
      await driver.index(
        SEARCH_COLLECTION,
        record.id,
        document,
        record.tenantId,
      );
    } catch (error) {
      this.logger.warn(
        `search index out of sync for ${SEARCH_COLLECTION}:${record.id}: ${(error as Error).message}`,
      );
    }
  }

  async search(subject: CapabilitySubject, options: WorkoutSearchOptions = {}) {
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    const searchWhere = options.search
      ? {
          id: {
            in: await this.searchEngines
              .resolve(
                options.searchEngine ?? this.searchEngines.defaultKeyword,
              )
              .search(
                SEARCH_COLLECTION,
                options.search,
                SEARCHABLE_FIELDS,
                TenantContextStorage.getTenantId(),
              ),
          },
        }
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
