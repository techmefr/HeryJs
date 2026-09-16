import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import { DriverResolver } from '#kernel/drivers/driver-resolver';
import { driverToken } from '#kernel/drivers/driver-token';
import type { HttpClientDriver } from '#kernel/http-client/http-client-driver';
import { FakeHttpClientDriver } from './fake-http-client.driver';
import { HttpClientDriverRegistry } from './http-client-driver.registry';

const fakeDriver = new FakeHttpClientDriver();

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, HttpClientDriver>) {}

  get<T>(token: symbol): T {
    const driver = this.drivers.get(token);

    if (!driver) {
      throw new Error(`no provider for ${String(token)}`);
    }

    return driver as T;
  }
}

// The httpClient slice is not on HeryConfig yet, so a test config has to be
// assembled the same way the registry reads it -- through a cast.
function configWith(slice: unknown): HeryConfig {
  return { httpClient: slice } as HeryConfig;
}

function buildRegistry(
  config: HeryConfig,
  installed: Record<string, HttpClientDriver> = {},
): HttpClientDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('http-client', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new HttpClientDriverRegistry(config, fakeDriver, resolver);
  registry.onModuleInit();
  return registry;
}

describe('HttpClientDriverRegistry', () => {
  it('falls back to the fake driver when hery.config.ts declares no httpClient slice', () => {
    const registry = buildRegistry({});

    expect(registry.active).toBe(fakeDriver);
  });

  it('resolves the built-in fake driver without any package installed', () => {
    const registry = buildRegistry(
      configWith({ default: 'fake', drivers: { fake: { driver: 'fake' } } }),
    );

    expect(registry.active).toBe(fakeDriver);
  });

  it('routes the active keyword to the installed driver', () => {
    const ofetchDriver = {} as HttpClientDriver;
    const registry = buildRegistry(
      configWith({
        default: 'ofetch',
        drivers: { fake: { driver: 'fake' }, ofetch: { driver: 'ofetch' } },
      }),
      { ofetch: ofetchDriver },
    );

    expect(registry.active).toBe(ofetchDriver);
  });

  /**
   * The whole point of resolving at boot: an app whose ofetch package is
   * missing must refuse to start rather than quietly answer every outbound
   * call from a fake, which looks healthy until an integration never fires.
   */
  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry(
        configWith({
          default: 'ofetch',
          drivers: { ofetch: { driver: 'ofetch' } },
        }),
      ),
    ).toThrow(/no module is installed to provide it/);
  });

  /**
   * A driver declared but unused still has to resolve, so that a project
   * running on the fake in development finds the missing package on its own
   * machine instead of the first time production boots with
   * HTTP_CLIENT_DRIVER=ofetch.
   */
  it('refuses to boot over a declared driver even when it is not the active one', () => {
    expect(() =>
      buildRegistry(
        configWith({
          default: 'fake',
          drivers: { fake: { driver: 'fake' }, ofetch: { driver: 'ofetch' } },
        }),
      ),
    ).toThrow(/no module is installed to provide it/);
  });

  it('refuses to boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry(
        configWith({
          default: 'ofetch',
          drivers: { fake: { driver: 'fake' } },
        }),
      ),
    ).toThrow(/is not declared in httpClient.drivers/);
  });
});
