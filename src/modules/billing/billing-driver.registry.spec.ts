import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#technical/config/hery-config.types';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { driverToken } from '#technical/drivers/driver-token';
import type { BillingDriver } from '#technical/billing/billing-driver';
import { LogBillingDriver } from './log-billing.driver';
import { BillingDriverRegistry } from './billing-driver.registry';

const logDriver = new LogBillingDriver();

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, BillingDriver>) {}

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
  installed: Record<string, BillingDriver> = {},
): BillingDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('billing', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new BillingDriverRegistry(config, logDriver, resolver);
  registry.onModuleInit();
  return registry;
}

describe('BillingDriverRegistry', () => {
  it('falls back to the log driver when hery.config.ts declares no billing slice', () => {
    expect(buildRegistry({}).active).toBe(logDriver);
  });

  it('routes the active keyword to the installed driver', () => {
    const stripeDriver = {} as BillingDriver;
    const registry = buildRegistry(
      {
        billing: {
          default: 'stripe',
          drivers: { log: { driver: 'log' }, stripe: { driver: 'stripe' } },
        },
      },
      { stripe: stripeDriver },
    );

    expect(registry.active).toBe(stripeDriver);
  });

  /**
   * The whole point of resolving at boot: an app whose provider package is
   * missing must refuse to start rather than let the webhook route quietly
   * 500 on its first real delivery.
   */
  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry({
        billing: {
          default: 'stripe',
          drivers: { stripe: { driver: 'stripe' } },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  it('refuses to boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry({
        billing: { default: 'stripe', drivers: { log: { driver: 'log' } } },
      }),
    ).toThrow(/is not declared in billing.drivers/);
  });
});
