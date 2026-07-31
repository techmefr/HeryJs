import type { HeryConfig } from '#technical/config/hery-config.types';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import type { PrismaSearchDriver } from './prisma-search.driver';
import { SearchEngineRegistry } from './search-engine.registry';
import type { SearchDriver } from './search-driver';

const prismaDriver = {} as PrismaSearchDriver;
const externalDriver = {} as SearchDriver;

describe('SearchEngineRegistry', () => {
  it('resolves the built-in prisma engine with no installed driver required', () => {
    const config: HeryConfig = {
      search: { default: 'prisma', engines: { prisma: { driver: 'prisma' } } },
    };
    const registry = new SearchEngineRegistry(config, prismaDriver);

    expect(registry.defaultKeyword).toBe('prisma');
    expect(registry.resolve('prisma')).toBe(prismaDriver);
  });

  it('routes a declared non-prisma engine to the installed driver', () => {
    const config: HeryConfig = {
      search: {
        default: 'elasticsearch',
        engines: {
          prisma: { driver: 'prisma' },
          elasticsearch: { driver: 'elasticsearch' },
        },
      },
    };
    const registry = new SearchEngineRegistry(
      config,
      prismaDriver,
      externalDriver,
    );

    expect(registry.resolve('elasticsearch')).toBe(externalDriver);
  });

  it('fails at construction, not at first search, when a declared engine has no installed driver', () => {
    const config: HeryConfig = {
      search: {
        default: 'elasticsearch',
        engines: { elasticsearch: { driver: 'elasticsearch' } },
      },
    };

    expect(() => new SearchEngineRegistry(config, prismaDriver)).toThrow(
      /elasticsearch/,
    );
  });

  it('rejects an undeclared engine keyword at request time, not a silent fallback', () => {
    const config: HeryConfig = {
      search: { default: 'prisma', engines: { prisma: { driver: 'prisma' } } },
    };
    const registry = new SearchEngineRegistry(config, prismaDriver);

    expect(() => registry.resolve('nonexistent')).toThrow(
      InvalidQueryException,
    );
  });
});
