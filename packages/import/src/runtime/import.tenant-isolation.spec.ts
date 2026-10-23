import type { ModuleRef } from '@nestjs/core';
import type { Job } from 'bullmq';
import type {
  DriverResolver,
  Importable,
  StorageDriver,
} from '#kernel/public/drivers';
import type { JobsService } from '#kernel/public/jobs';
import type { NotificationProvider } from '#kernel/public/notifications';
import { TenantContextStorage } from '#kernel/public/tenancy';
import { CsvImportDriver } from './csv-import.driver';
import { IMPORT_CONSUME_JOB } from './import.constants';
import type { ImportDriverRegistry } from './import-driver.registry';
import { ImportProcessor } from './import.processor';
import { ImportService } from './import.service';

describe('tenant isolation', () => {
  const files = new Map<string, Buffer>([
    ['tenant-a/a.csv', Buffer.from('title\nrow of a\n')],
    ['tenant-b/b.csv', Buffer.from('title\nsecret of b\n')],
  ]);
  const consumed: Array<{ tenantId: string | null; titles: unknown[] }> = [];
  const read: string[] = [];

  const storage = {
    get: (key: string) => {
      read.push(key);
      return Promise.resolve(files.get(key) ?? Buffer.alloc(0));
    },
  } as unknown as StorageDriver;

  const importable: Importable = {
    name: 'tasks',
    columns: ['title'],
    consume: (rows) => {
      consumed.push({
        tenantId: TenantContextStorage.findTenantId(),
        titles: rows.map((row) => row.title),
      });
      return Promise.resolve({
        accepted: rows.length,
        rejected: 0,
        errors: [],
      });
    },
  };

  const processor = new ImportProcessor(
    { resolve: () => new CsvImportDriver() } as unknown as ImportDriverRegistry,
    { get: () => importable } as unknown as ModuleRef,
    { find: () => storage } as unknown as DriverResolver,
    {
      send: () => Promise.resolve(),
    } as unknown as NotificationProvider,
  );

  function job(data: Record<string, unknown>): Job {
    return {
      name: IMPORT_CONSUME_JOB,
      data: { format: 'csv', importable: 'tasks', userId: 'user', ...data },
    } as Job;
  }

  beforeEach(() => {
    consumed.length = 0;
    read.length = 0;
  });

  it('never reads a file of another tenant, even when a tenant names its key', async () => {
    await processor.process(
      job({ key: 'tenant-b/b.csv', tenantId: 'tenant-a' }),
    );

    expect(read).toEqual([]);
    expect(consumed).toEqual([]);
  });

  it('never reads a file of another tenant named from inside a tenant context', async () => {
    await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      processor.process(job({ key: 'tenant-b/b.csv' })),
    );

    expect(read).toEqual([]);
    expect(consumed).toEqual([]);
  });

  it('writes the rows into the tenant that queued the import, with no tenant around the worker', async () => {
    await processor.process(
      job({ key: 'tenant-a/a.csv', tenantId: 'tenant-a' }),
    );

    expect(consumed).toEqual([{ tenantId: 'tenant-a', titles: ['row of a'] }]);
  });

  it('refuses a job that names no tenant rather than writing outside every tenant', async () => {
    await processor.process(job({ key: 'tenant-a/a.csv' }));

    expect(read).toEqual([]);
    expect(consumed).toEqual([]);
  });

  it('stamps the queuing tenant on the job', async () => {
    const dispatchTo = jest.fn().mockResolvedValue(undefined);
    const service = new ImportService(
      {
        resolve: () => new CsvImportDriver(),
        defaultKeyword: 'csv',
      } as unknown as ImportDriverRegistry,
      { dispatchTo } as unknown as JobsService,
    );

    await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      service.from('csv').queue('tenant-a/a.csv', importable, 'user-a'),
    );

    expect(dispatchTo).toHaveBeenCalledWith(
      expect.anything(),
      IMPORT_CONSUME_JOB,
      expect.objectContaining({ tenantId: 'tenant-a', key: 'tenant-a/a.csv' }),
      expect.anything(),
    );
  });
});
