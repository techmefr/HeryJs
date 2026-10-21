import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { driverToken } from '#technical/drivers/driver-token';
import { ErrorReporterDriverRegistry } from './error-reporter-driver.registry';
import { NoopErrorReporterDriver } from './noop-error-reporter.driver';
import type { ErrorReporterDriver } from './error-reporter-driver';

const noopDriver = new NoopErrorReporterDriver();

const sentryDriver: ErrorReporterDriver = {
  capture: () => Promise.resolve(),
  flush: () => Promise.resolve(),
};

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, ErrorReporterDriver>) {}

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
  installed: Record<string, ErrorReporterDriver> = {},
): ErrorReporterDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('error-reporter', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new ErrorReporterDriverRegistry(
    config,
    noopDriver,
    resolver,
  );
  registry.onModuleInit();
  return registry;
}

describe('ErrorReporterDriverRegistry', () => {
  it('reports nowhere when hery.config.ts declares no errorReporter slice', () => {
    expect(buildRegistry({}).active).toBe(noopDriver);
  });

  it('resolves an installed driver by the name hery.config.ts gives it', () => {
    const registry = buildRegistry(
      {
        errorReporter: {
          default: 'sentry',
          drivers: { sentry: { driver: 'sentry' } },
        },
      },
      { sentry: sentryDriver },
    );

    expect(registry.active).toBe(sentryDriver);
  });

  it('stops the boot when a declared driver is not installed', () => {
    expect(() =>
      buildRegistry({
        errorReporter: {
          default: 'sentry',
          drivers: { sentry: { driver: 'sentry' } },
        },
      }),
    ).toThrow('pnpm hery install error-reporter-sentry');
  });

  it('stops the boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry({
        errorReporter: {
          default: 'bugsnag',
          drivers: { noop: { driver: 'noop' } },
        },
      }),
    ).toThrow('errorReporter.default to "bugsnag"');
  });
});
