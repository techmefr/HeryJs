import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { driverToken } from '#technical/drivers/driver-token';
import { FeatureFlagsDriverRegistry } from './feature-flags-driver.registry';
import { LocalFeatureFlagsDriver } from './local-feature-flags.driver';
import type { FeatureFlagDriver } from './feature-flags-driver';

const localDriver = new LocalFeatureFlagsDriver({} as never);

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, FeatureFlagDriver>) {}

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
  installed: Record<string, FeatureFlagDriver> = {},
): FeatureFlagsDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('feature-flags', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new FeatureFlagsDriverRegistry(
    config,
    localDriver,
    resolver,
  );
  registry.onModuleInit();
  return registry;
}

describe('FeatureFlagsDriverRegistry', () => {
  it('falls back to the local driver when hery.config.ts declares no featureFlags slice', () => {
    const registry = buildRegistry({});

    expect(registry.active).toBe(localDriver);
  });

  it('resolves the built-in local driver without any package installed', () => {
    const registry = buildRegistry({
      featureFlags: {
        default: 'local',
        drivers: { local: { driver: 'local' } },
      },
    });

    expect(registry.active).toBe(localDriver);
  });

  it('routes the active keyword to the installed driver', () => {
    const launchDarklyDriver = {} as FeatureFlagDriver;
    const registry = buildRegistry(
      {
        featureFlags: {
          default: 'launchdarkly',
          drivers: {
            local: { driver: 'local' },
            launchdarkly: { driver: 'launchdarkly' },
          },
        },
      },
      { launchdarkly: launchDarklyDriver },
    );

    expect(registry.active).toBe(launchDarklyDriver);
  });

  /**
   * The whole point of resolving at boot: an app whose feature-flags provider
   * package is missing must refuse to start rather than quietly checking
   * Postgres for a flag that was meant to be evaluated elsewhere.
   */
  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry({
        featureFlags: {
          default: 'launchdarkly',
          drivers: { launchdarkly: { driver: 'launchdarkly' } },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  /**
   * A driver declared but unused still has to resolve, so that a project
   * running on local in development finds the missing provider package on its
   * own machine instead of the first time production boots with it active.
   */
  it('refuses to boot over a declared driver even when it is not the active one', () => {
    expect(() =>
      buildRegistry({
        featureFlags: {
          default: 'local',
          drivers: {
            local: { driver: 'local' },
            launchdarkly: { driver: 'launchdarkly' },
          },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  it('refuses to boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry({
        featureFlags: {
          default: 'launchdarkly',
          drivers: { local: { driver: 'local' } },
        },
      }),
    ).toThrow(/is not declared in featureFlags.drivers/);
  });
});
