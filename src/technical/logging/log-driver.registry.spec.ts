import type { HeryConfig } from '#technical/config/hery-config.types';
import type { DriverResolver } from '#technical/drivers/driver-resolver';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { DatabaseLogDriver } from './database-log.driver';
import { FileLogDriver } from './file-log.driver';
import { logDriverToken } from './log-driver';
import type { LogDriver } from './log-driver';
import { LogDriverRegistry } from './log-driver.registry';
import { logPipeline } from './log.pipeline';
import { StdoutLogDriver } from './stdout-log.driver';

const database = new DatabaseLogDriver({} as TenantScopedPrismaClient);

function registry(
  logging: HeryConfig['logging'],
  find: DriverResolver['find'] = () => undefined,
): LogDriverRegistry {
  return new LogDriverRegistry({ logging }, database, {
    find,
  } as DriverResolver);
}

describe('LogDriverRegistry', () => {
  afterEach(async () => {
    await logPipeline.detach();
  });

  it('is stdout alone when nothing is declared', () => {
    const drivers = registry(undefined);
    const attach = jest.spyOn(logPipeline, 'attach');

    drivers.onModuleInit();

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0]?.[0]).toHaveLength(1);
    expect(attach.mock.calls[0]?.[0][0]).toBeInstanceOf(StdoutLogDriver);
    expect(drivers.reader).toBeNull();

    attach.mockRestore();
  });

  it('attaches every declared driver, not just the default', () => {
    const attach = jest.spyOn(logPipeline, 'attach');

    registry({
      default: 'stdout',
      drivers: {
        stdout: { driver: 'stdout' },
        store: { driver: 'database' },
      },
    }).onModuleInit();

    const attached = attach.mock.calls[0]?.[0] ?? [];

    expect(attached).toHaveLength(2);
    expect(attached).toContain(database);

    attach.mockRestore();
  });

  it('reads from the default driver when it can answer, else the first that can', () => {
    const preferred = registry({
      default: 'store',
      drivers: {
        stdout: { driver: 'stdout' },
        store: { driver: 'database' },
      },
    });
    const fallback = registry({
      default: 'stdout',
      drivers: {
        stdout: { driver: 'stdout' },
        store: { driver: 'database' },
      },
    });

    preferred.onModuleInit();
    fallback.onModuleInit();

    expect(preferred.reader).toBe(database);
    expect(fallback.reader).toBe(database);
    expect(fallback.store).toBe(database);
  });

  it('builds the file driver from its env', () => {
    const attach = jest.spyOn(logPipeline, 'attach');

    registry({
      default: 'file',
      drivers: { file: { driver: 'file' } },
    }).onModuleInit();

    expect(attach.mock.calls[0]?.[0][0]).toBeInstanceOf(FileLogDriver);

    attach.mockRestore();
  });

  it('resolves a driver shipped as a package by its token name', () => {
    const external: LogDriver = { write: () => undefined };
    const find = jest.fn(() => external) as unknown as DriverResolver['find'];
    const attach = jest.spyOn(logPipeline, 'attach');

    registry(
      { default: 'dd', drivers: { dd: { driver: 'datadog' } } },
      find,
    ).onModuleInit();

    expect(find).toHaveBeenCalledWith('log', 'datadog');
    expect(attach.mock.calls[0]?.[0]).toEqual([external]);
    expect(logDriverToken('datadog')).toBe(
      Symbol.for('heryjs:log-driver:datadog'),
    );

    attach.mockRestore();
  });

  it('refuses to boot when a declared driver was never installed', () => {
    expect(() =>
      registry({
        default: 'dd',
        drivers: { dd: { driver: 'datadog' } },
      }).onModuleInit(),
    ).toThrow(/pnpm hery install log-datadog/);
  });

  it('refuses to boot when the default is not declared', () => {
    expect(() =>
      registry({
        default: 'nowhere',
        drivers: { stdout: { driver: 'stdout' } },
      }).onModuleInit(),
    ).toThrow(/logging.default to "nowhere"/);
  });

  it('hands the pipeline back to stdout on shutdown', async () => {
    const drivers = registry({
      default: 'store',
      drivers: { store: { driver: 'database' } },
    });
    const detach = jest.spyOn(logPipeline, 'detach');

    drivers.onModuleInit();
    await drivers.onModuleDestroy();

    expect(detach).toHaveBeenCalledTimes(1);

    detach.mockRestore();
  });
});
