import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { PrismaSearchDriver } from './prisma-search.driver';
import { searchDriverToken } from './search-driver';
import type { SearchDriver } from './search-driver';

const BUILTIN_DRIVER = 'prisma';

/**
 * Scout-style engine selection: hery.config.ts's search.engines is the
 * closed list, and every entry in it has to resolve to a real driver right
 * here, during boot, or the app never finishes starting -- a misconfigured
 * engine is a startup failure, never a silent fallback to Prisma. A request
 * asking for a keyword this registry never heard of is a different, much
 * cheaper mistake (same family as an unknown sort/filter field), so that one
 * surfaces as a normal 400 from resolve(), not a crash.
 *
 * Resolution happens in onModuleInit rather than the constructor because it
 * looks up each engine's driver by its own token via ModuleRef -- a driver
 * module (Elasticsearch, Meilisearch) is bound globally but outside this
 * module's own import graph, so `strict: false` is required to find it, and
 * that lookup needs every provider in the app already instantiated, which
 * constructor time does not guarantee the way this lifecycle hook does.
 */
@Injectable()
export class SearchEngineRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, SearchDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly prismaDriver: PrismaSearchDriver,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    const engines = this.config.search?.engines ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [name, engine] of Object.entries(engines)) {
      if (engine.driver === BUILTIN_DRIVER) {
        this.drivers.set(name, this.prismaDriver);
        continue;
      }

      let driver: SearchDriver | undefined;

      try {
        driver = this.moduleRef.get<SearchDriver>(
          searchDriverToken(engine.driver),
          { strict: false },
        );
      } catch {
        driver = undefined;
      }

      if (!driver) {
        throw new Error(
          `hery.config.ts declares search engine "${name}" with driver "${engine.driver}", but no search module is installed to provide it. Run "pnpm hery install search-${engine.driver}" or remove "${name}" from hery.config.ts.`,
        );
      }

      this.drivers.set(name, driver);
    }
  }

  get defaultKeyword(): string {
    return this.config.search?.default ?? BUILTIN_DRIVER;
  }

  // Every distinct non-Prisma driver a project has declared -- a write has
  // to sync all of them, since search[engine] lets a later request read
  // through any one of them. Deduplicated by instance: two engine names
  // pointing at the same installed driver (unusual, but not forbidden) only
  // get indexed once. The Prisma driver's own index()/remove() are no-ops,
  // so there is nothing useful to index into it anyway.
  get externalDrivers(): SearchDriver[] {
    return [...new Set(this.drivers.values())].filter(
      (driver) => driver !== this.prismaDriver,
    );
  }

  private get knownKeywords(): string[] {
    return [...this.drivers.keys()];
  }

  resolve(keyword: string): SearchDriver {
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new InvalidQueryException('search.engine', this.knownKeywords);
    }

    return driver;
  }
}
