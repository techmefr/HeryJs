import { Global, Injectable, Module } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { PrismaSearchDriver } from './prisma-search.driver';
import { SearchEngineRegistry } from './search-engine.registry';
import { searchDriverToken } from './search-driver';
import type { SearchDriver } from './search-driver';

const prismaDriver = {} as PrismaSearchDriver;

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, SearchDriver>) {}

  get<T>(token: symbol): T {
    const driver = this.drivers.get(token);

    if (!driver) {
      throw new Error(`no provider for ${String(token)}`);
    }

    return driver as T;
  }
}

function buildRegistry(
  config: HeryConfig,
  installed: Record<string, SearchDriver> = {},
): SearchEngineRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      searchDriverToken(name),
      driver,
    ]),
  );
  const registry = new SearchEngineRegistry(
    config,
    prismaDriver,
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  registry.onModuleInit();
  return registry;
}

describe('SearchEngineRegistry', () => {
  it('resolves the built-in prisma engine with no installed driver required', () => {
    const registry = buildRegistry({
      search: { default: 'prisma', engines: { prisma: { driver: 'prisma' } } },
    });

    expect(registry.defaultKeyword).toBe('prisma');
    expect(registry.resolve('prisma')).toBe(prismaDriver);
  });

  it('routes a declared non-prisma engine to the installed driver', () => {
    const elasticDriver = {} as SearchDriver;
    const registry = buildRegistry(
      {
        search: {
          default: 'elasticsearch',
          engines: {
            prisma: { driver: 'prisma' },
            elasticsearch: { driver: 'elasticsearch' },
          },
        },
      },
      { elasticsearch: elasticDriver },
    );

    expect(registry.resolve('elasticsearch')).toBe(elasticDriver);
  });

  it('fails at onModuleInit, not at first search, when a declared engine has no installed driver', () => {
    const registry = new SearchEngineRegistry(
      {
        search: {
          default: 'elasticsearch',
          engines: { elasticsearch: { driver: 'elasticsearch' } },
        },
      },
      prismaDriver,
      new FakeModuleRef(new Map()) as unknown as ModuleRef,
    );

    expect(() => registry.onModuleInit()).toThrow(/elasticsearch/);
  });

  it('rejects an undeclared engine keyword at request time, not a silent fallback', () => {
    const registry = buildRegistry({
      search: { default: 'prisma', engines: { prisma: { driver: 'prisma' } } },
    });

    expect(() => registry.resolve('nonexistent')).toThrow(
      InvalidQueryException,
    );
  });

  it('routes two distinct non-prisma engines to two distinct drivers, never aliasing one to the other', () => {
    const elasticDriver = {} as SearchDriver;
    const meiliDriver = {} as SearchDriver;
    const registry = buildRegistry(
      {
        search: {
          default: 'elasticsearch',
          engines: {
            elasticsearch: { driver: 'elasticsearch' },
            meilisearch: { driver: 'meilisearch' },
          },
        },
      },
      { elasticsearch: elasticDriver, meilisearch: meiliDriver },
    );

    expect(registry.resolve('elasticsearch')).toBe(elasticDriver);
    expect(registry.resolve('meilisearch')).toBe(meiliDriver);
    expect(registry.resolve('elasticsearch')).not.toBe(
      registry.resolve('meilisearch'),
    );
  });

  it('externalDrivers lists every distinct non-prisma driver, excluding prisma itself', () => {
    const elasticDriver = {} as SearchDriver;
    const meiliDriver = {} as SearchDriver;
    const registry = buildRegistry(
      {
        search: {
          default: 'prisma',
          engines: {
            prisma: { driver: 'prisma' },
            elasticsearch: { driver: 'elasticsearch' },
            meilisearch: { driver: 'meilisearch' },
          },
        },
      },
      { elasticsearch: elasticDriver, meilisearch: meiliDriver },
    );

    expect(registry.externalDrivers).toHaveLength(2);
    expect(registry.externalDrivers).toEqual(
      expect.arrayContaining([elasticDriver, meiliDriver]),
    );
  });
});

/**
 * The bug this regression test targets only exists at the level of real
 * NestJS dependency injection: two driver modules each provide under what
 * used to be one shared token, so whichever module's global provider
 * registered last silently won for both engine names. A hand-constructed
 * FakeModuleRef (above) cannot reproduce that failure mode, since it never
 * goes through Nest's own container -- so this proof wires two fake engine
 * modules exactly the way search-elasticsearch/search-meilisearch do,
 * through a real TestingModule, and asserts they resolve to two different
 * instances.
 */
describe('SearchEngineRegistry over real Nest DI', () => {
  @Injectable()
  class FirstDriver implements SearchDriver {
    async index(): Promise<void> {}
    async remove(): Promise<void> {}
    search(): Promise<string[]> {
      return Promise.resolve([]);
    }
  }

  @Injectable()
  class SecondDriver implements SearchDriver {
    async index(): Promise<void> {}
    async remove(): Promise<void> {}
    search(): Promise<string[]> {
      return Promise.resolve([]);
    }
  }

  const FIRST_TOKEN = searchDriverToken('first-engine');
  const SECOND_TOKEN = searchDriverToken('second-engine');

  @Global()
  @Module({
    providers: [
      FirstDriver,
      { provide: FIRST_TOKEN, useExisting: FirstDriver },
    ],
    exports: [FIRST_TOKEN],
  })
  class FirstEngineModule {}

  @Global()
  @Module({
    providers: [
      SecondDriver,
      { provide: SECOND_TOKEN, useExisting: SecondDriver },
    ],
    exports: [SECOND_TOKEN],
  })
  class SecondEngineModule {}

  it('lets two installed engine modules coexist without one shadowing the other', async () => {
    const config: HeryConfig = {
      search: {
        default: 'first',
        engines: {
          first: { driver: 'first-engine' },
          second: { driver: 'second-engine' },
        },
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [FirstEngineModule, SecondEngineModule],
      providers: [
        SearchEngineRegistry,
        { provide: HERY_CONFIG, useValue: config },
        { provide: PrismaSearchDriver, useValue: prismaDriver },
      ],
    }).compile();

    const registry = moduleRef.get(SearchEngineRegistry);
    registry.onModuleInit();

    const first = registry.resolve('first');
    const second = registry.resolve('second');

    expect(first).toBeInstanceOf(FirstDriver);
    expect(second).toBeInstanceOf(SecondDriver);
    expect(first).not.toBe(second);

    await moduleRef.close();
  });
});
