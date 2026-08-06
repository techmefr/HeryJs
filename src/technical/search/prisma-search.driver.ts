import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { matchesFrom } from './search-driver';
import type { SearchDriver, SearchMatches } from './search-driver';
import { buildTextSearchWhere } from './text-search';

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

interface FindManyDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    select: { id: true };
    take: number;
  }): Promise<{ id: string }[]>;
}

/**
 * The framework's own default engine -- no module to install, no external
 * process to run. It never touches the tenantId parameter the SearchDriver
 * contract requires: reading through the same tenant-scoped Prisma client
 * every other query in the app already goes through is the "filter pushed
 * to the engine itself" rule applied here, just with the engine being
 * Prisma's own query rather than an external one.
 */
@Injectable()
export class PrismaSearchDriver implements SearchDriver {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async index(): Promise<void> {
    // Prisma is already the system of record -- there is no separate index
    // to keep in sync.
  }

  async remove(): Promise<void> {
    // Same: nothing external to remove a row from. tenantId is part of the
    // shared SearchDriver contract, unused here like the rest of this driver's
    // no-op indexing methods.
  }

  // No LIMIT at all was the silent one here: the other two drivers cut the
  // result set at an engine default, this one would happily walk every row a
  // one-letter term matched.
  async search(
    collection: string,
    term: string,
    fields: readonly string[],
    _tenantId: string,
    limit: number,
  ): Promise<SearchMatches> {
    const delegateName = kebabToCamel(collection);
    const delegate = (
      this.prisma as unknown as Record<string, FindManyDelegate>
    )[delegateName];

    if (!delegate) {
      throw new Error(`No Prisma delegate for collection "${collection}"`);
    }

    const rows = await delegate.findMany({
      where: buildTextSearchWhere(term, fields) ?? {},
      select: { id: true },
      take: limit + 1,
    });

    return matchesFrom(
      rows.map((row) => row.id),
      limit,
    );
  }
}
