import type { ModuleRef } from '@nestjs/core';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import { DriverResolver } from '#kernel/drivers/driver-resolver';
import { driverToken } from '#kernel/drivers/driver-token';
import type { ImportDriver } from '#kernel/import/import-driver';
import { CsvImportDriver } from './csv-import.driver';
import { ImportDriverRegistry } from './import-driver.registry';

const csvDriver = new CsvImportDriver();

class FakeModuleRef {
  constructor(private readonly drivers: Map<symbol, ImportDriver>) {}

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
  installed: Record<string, ImportDriver> = {},
): ImportDriverRegistry {
  const drivers = new Map(
    Object.entries(installed).map(([name, driver]) => [
      driverToken('import', name),
      driver,
    ]),
  );
  const resolver = new DriverResolver(
    new FakeModuleRef(drivers) as unknown as ModuleRef,
  );
  const registry = new ImportDriverRegistry(config, csvDriver, resolver);
  registry.onModuleInit();
  return registry;
}

describe('ImportDriverRegistry', () => {
  it('falls back to the csv driver when hery.config.ts declares no import slice', () => {
    const registry = buildRegistry({});

    expect(registry.resolve()).toBe(csvDriver);
    expect(registry.formats).toEqual(['csv']);
  });

  it('resolves the built-in csv driver without any package installed', () => {
    const registry = buildRegistry({
      import: { default: 'csv', drivers: { csv: { driver: 'csv' } } },
    });

    expect(registry.resolve('csv')).toBe(csvDriver);
  });

  /**
   * Per-call selection is the whole difference from mail: a declared driver
   * that is not the default must still be resolvable, because the format comes
   * from the upload rather than from the deployment.
   */
  it('keeps every declared driver usable at once', () => {
    const xlsxDriver = {} as ImportDriver;
    const registry = buildRegistry(
      {
        import: {
          default: 'csv',
          drivers: { csv: { driver: 'csv' }, xlsx: { driver: 'xlsx' } },
        },
      },
      { xlsx: xlsxDriver },
    );

    expect(registry.resolve('csv')).toBe(csvDriver);
    expect(registry.resolve('xlsx')).toBe(xlsxDriver);
    expect(registry.resolve()).toBe(csvDriver);
  });

  /**
   * An app whose xlsx package is missing must refuse to start rather than
   * accept an upload it has no way to read, which looks healthy right up to
   * the first spreadsheet.
   */
  it('refuses to boot when a declared driver has no module installed', () => {
    expect(() =>
      buildRegistry({
        import: {
          default: 'csv',
          drivers: { csv: { driver: 'csv' }, xlsx: { driver: 'xlsx' } },
        },
      }),
    ).toThrow(/no module is installed to provide it/);
  });

  it('refuses to boot when the default names a driver that is not declared', () => {
    expect(() =>
      buildRegistry({
        import: { default: 'xlsx', drivers: { csv: { driver: 'csv' } } },
      }),
    ).toThrow(/is not declared in import.drivers/);
  });

  /**
   * A format arriving with an upload is user input, so it is a 400 rather than
   * the boot failure a misconfigured driver gets.
   */
  it('rejects an unknown format as a bad request', () => {
    const registry = buildRegistry({});

    expect(() => registry.resolve('pdf')).toThrow(/Allowed: csv/);
  });
});
