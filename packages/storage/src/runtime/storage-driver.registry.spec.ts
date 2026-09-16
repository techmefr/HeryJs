import type { ModuleRef } from '@nestjs/core';
import type {
  HeryConfig,
  HeryConfigDrivers,
} from '#kernel/config/hery-config.types';
import { DriverResolver } from '#kernel/drivers/driver-resolver';
import { driverToken } from '#kernel/drivers/driver-token';
import { LocalStorageDriver } from './local-storage.driver';
import { StorageDriverRegistry } from './storage-driver.registry';
import type { StorageDriver } from '#kernel/storage/storage-driver';

const localDriver = new LocalStorageDriver();

// `storage` is still pending on HeryConfig, so the slice is attached
// structurally here exactly as the registry reads it.
type StorageConfig = HeryConfig & { storage?: HeryConfigDrivers };

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, StorageDriver>) {}

  get<T>(token: symbol): T {
    const driver = this.drivers.get(token);

    if (!driver) {
      throw new Error(`no provider for ${String(token)}`);
    }

    return driver as T;
  }
}

function buildRegistry(
  config: StorageConfig,
  installed: Record<string, StorageDriver> = {},
): StorageDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('storage', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new StorageDriverRegistry(config, localDriver, resolver);
  registry.onModuleInit();
  return registry;
}

describe('StorageDriverRegistry', () => {
  it('falls back to the local driver when hery.config.ts declares no storage slice', () => {
    const registry = buildRegistry({});

    expect(registry.active).toBe(localDriver);
  });

  it('resolves the built-in local driver without any package installed', () => {
    const registry = buildRegistry({
      storage: { default: 'local', drivers: { local: { driver: 'local' } } },
    });

    expect(registry.active).toBe(localDriver);
  });

  it('routes the active keyword to the installed driver', () => {
    const s3Driver = {} as StorageDriver;
    const registry = buildRegistry(
      {
        storage: {
          default: 's3',
          drivers: { local: { driver: 'local' }, s3: { driver: 's3' } },
        },
      },
      { s3: s3Driver },
    );

    expect(registry.active).toBe(s3Driver);
  });

  /**
   * The whole point of resolving at boot: an app whose storage package is
   * missing must refuse to start rather than quietly keep every uploaded file
   * on a local disk the next deploy throws away.
   */
  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry({
        storage: { default: 's3', drivers: { s3: { driver: 's3' } } },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  /**
   * A driver declared but unused still has to resolve, so that a project
   * running on local disk in development finds the missing S3 package on its
   * own machine instead of the first time production boots on s3.
   */
  it('refuses to boot over a declared driver even when it is not the active one', () => {
    expect(() =>
      buildRegistry({
        storage: {
          default: 'local',
          drivers: { local: { driver: 'local' }, s3: { driver: 's3' } },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  it('refuses to boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry({
        storage: { default: 's3', drivers: { local: { driver: 'local' } } },
      }),
    ).toThrow(/is not declared in storage.drivers/);
  });
});
