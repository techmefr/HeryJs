import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import { DriverResolver } from '#kernel/drivers/driver-resolver';
import { driverToken } from '#kernel/drivers/driver-token';
import { LogMailDriver } from './log-mail.driver';
import { MailDriverRegistry } from './mail-driver.registry';
import type { MailDriver } from '#kernel/mail/mail-driver';

const logDriver = new LogMailDriver();

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, MailDriver>) {}

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
  installed: Record<string, MailDriver> = {},
): MailDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('mail', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new MailDriverRegistry(config, logDriver, resolver);
  registry.onModuleInit();
  return registry;
}

describe('MailDriverRegistry', () => {
  it('falls back to the log driver when hery.config.ts declares no mail slice', () => {
    const registry = buildRegistry({});

    expect(registry.active).toBe(logDriver);
  });

  it('resolves the built-in log driver without any package installed', () => {
    const registry = buildRegistry({
      mail: { default: 'log', drivers: { log: { driver: 'log' } } },
    });

    expect(registry.active).toBe(logDriver);
  });

  it('routes the active keyword to the installed driver', () => {
    const smtpDriver = {} as MailDriver;
    const registry = buildRegistry(
      {
        mail: {
          default: 'smtp',
          drivers: { log: { driver: 'log' }, smtp: { driver: 'smtp' } },
        },
      },
      { smtp: smtpDriver },
    );

    expect(registry.active).toBe(smtpDriver);
  });

  /**
   * The whole point of resolving at boot: an app whose mail package is missing
   * must refuse to start rather than quietly log every message it was asked to
   * send, which looks healthy until someone reports an email that never came.
   */
  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry({
        mail: {
          default: 'smtp',
          drivers: { smtp: { driver: 'smtp' } },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  /**
   * A driver declared but unused still has to resolve, so that a project
   * running on log in development finds the missing SMTP package on its own
   * machine instead of the first time production boots with MAIL_DRIVER=smtp.
   */
  it('refuses to boot over a declared driver even when it is not the active one', () => {
    expect(() =>
      buildRegistry({
        mail: {
          default: 'log',
          drivers: { log: { driver: 'log' }, smtp: { driver: 'smtp' } },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  it('refuses to boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry({
        mail: { default: 'smtp', drivers: { log: { driver: 'log' } } },
      }),
    ).toThrow(/is not declared in mail.drivers/);
  });
});
