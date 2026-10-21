import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { driverToken } from '#technical/drivers/driver-token';
import type { EmbeddingDriver } from '#technical/embeddings/embedding-driver';
import { EmbeddingDriverRegistry } from './embedding-driver.registry';
import { FakeEmbeddingDriver } from './fake-embedding.driver';
import { OpenAiCompatibleEmbeddingDriver } from './openai-compatible-embedding.driver';

const fakeDriver = new FakeEmbeddingDriver();

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, EmbeddingDriver>) {}

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
  installed: Record<string, EmbeddingDriver> = {},
): EmbeddingDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('embeddings', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new EmbeddingDriverRegistry(config, fakeDriver, resolver);
  registry.onModuleInit();
  return registry;
}

describe('EmbeddingDriverRegistry', () => {
  it('falls back to the fake driver when hery.config.ts declares no embeddings slice', () => {
    expect(buildRegistry({}).active).toBe(fakeDriver);
  });

  it('builds the openai-compatible driver when it is declared', () => {
    const registry = buildRegistry({
      embeddings: {
        default: 'openai',
        drivers: { openai: { driver: 'openai-compatible' } },
      },
    });

    expect(registry.active).toBeInstanceOf(OpenAiCompatibleEmbeddingDriver);
  });

  it('routes the active keyword to an installed driver', () => {
    const custom = { dimensions: 3, embed: jest.fn() } as EmbeddingDriver;
    const registry = buildRegistry(
      {
        embeddings: {
          default: 'custom',
          drivers: { fake: { driver: 'fake' }, custom: { driver: 'voyage' } },
        },
      },
      { voyage: custom },
    );

    expect(registry.active).toBe(custom);
  });

  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry({
        embeddings: {
          default: 'voyage',
          drivers: { voyage: { driver: 'voyage' } },
        },
      }),
    ).toThrow(/pnpm hery install embeddings-voyage/);
  });

  it('refuses to boot when the default names an undeclared driver', () => {
    expect(() =>
      buildRegistry({
        embeddings: { default: 'ghost', drivers: { fake: { driver: 'fake' } } },
      }),
    ).toThrow(/sets embeddings.default to "ghost"/);
  });
});
