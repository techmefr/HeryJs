import { Inject, Injectable, Optional } from '@nestjs/common';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { PrismaSearchDriver } from './prisma-search.driver';
import { SEARCH_DRIVER } from './search-driver';
import type { SearchDriver } from './search-driver';

const BUILTIN_DRIVER = 'prisma';

/**
 * Scout-style engine selection: hery.config.ts's search.engines is the
 * closed list, and every entry in it has to resolve to a real driver right
 * here, in this constructor, or the app never finishes booting -- a
 * misconfigured engine is a startup failure, never a silent fallback to
 * Prisma. A request asking for a keyword this registry never heard of is a
 * different, much cheaper mistake (same family as an unknown sort/filter
 * field), so that one surfaces as a normal 400 from resolve(), not a crash.
 */
@Injectable()
export class SearchEngineRegistry {
  private readonly drivers = new Map<string, SearchDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    prismaDriver: PrismaSearchDriver,
    @Optional()
    @Inject(SEARCH_DRIVER)
    private readonly installedDriver?: SearchDriver,
  ) {
    const engines = config.search?.engines ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [name, engine] of Object.entries(engines)) {
      if (engine.driver === BUILTIN_DRIVER) {
        this.drivers.set(name, prismaDriver);
        continue;
      }

      if (!installedDriver) {
        throw new Error(
          `hery.config.ts declares search engine "${name}" with driver "${engine.driver}", but no search module is installed to provide it. Run "pnpm hery install search-${engine.driver}" or remove "${name}" from hery.config.ts.`,
        );
      }

      this.drivers.set(name, installedDriver);
    }
  }

  get defaultKeyword(): string {
    return this.config.search?.default ?? BUILTIN_DRIVER;
  }

  // Indexing is not keyword-routed like search() is: whatever single
  // external engine is installed (at most one today -- ES and Meilisearch
  // both bind the same SEARCH_DRIVER token) is the one thing worth keeping
  // in sync on every write. The Prisma driver's own index() is a no-op, so
  // there is nothing useful to index into it anyway.
  get externalDriver(): SearchDriver | undefined {
    return this.installedDriver;
  }

  private get knownKeywords(): string[] {
    return [...this.drivers.keys()];
  }

  resolve(keyword: string): SearchDriver {
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new InvalidQueryException('search[engine]', this.knownKeywords);
    }

    return driver;
  }
}
