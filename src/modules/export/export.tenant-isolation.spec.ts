import type { Job } from 'bullmq';
import type { DriverResolver, StorageDriver } from '@heryjs/core/drivers';
import type { JobsService } from '@heryjs/core/jobs';
import type { NotificationProvider } from '@heryjs/core/notifications';
import { TenantContextStorage } from '@heryjs/core/tenancy';
import { CsvExportDriver } from './csv-export.driver';
import { EXPORT_GENERATE_JOB } from './export.constants';
import type { ExportDriverRegistry } from './export-driver.registry';
import { ExportProcessor } from './export.processor';
import { ExportService } from './export.service';

describe('tenant isolation', () => {
  const objects = new Map<string, Buffer>();
  const keys = new Map<string, string | null>();

  const storage = {
    put: (key: string, body: Buffer) => {
      objects.set(key, body);
      return Promise.resolve({ key });
    },
  } as unknown as StorageDriver;

  const processor = new ExportProcessor(
    {
      resolve: () => new CsvExportDriver(),
    } as unknown as ExportDriverRegistry,
    { find: () => storage } as unknown as DriverResolver,
    {
      send: (
        userId: string,
        _type: string,
        payload: { key: string | null },
      ) => {
        keys.set(userId, payload.key);
        return Promise.resolve();
      },
    } as unknown as NotificationProvider,
  );

  function exportAs(tenantId: string, userId: string, title: string) {
    return TenantContextStorage.run({ tenantId }, () =>
      processor.process({
        name: EXPORT_GENERATE_JOB,
        data: {
          format: 'csv',
          filename: 'tasks',
          columns: ['title'],
          rows: [{ title }],
          userId,
        },
      } as Job),
    );
  }

  it('keeps the file a tenant exported out of reach of another tenant exporting the same name', async () => {
    await exportAs('tenant-b', 'user-b', 'secret of b');
    await exportAs('tenant-a', 'user-a', 'data of a');

    const keyOfB = keys.get('user-b');
    const keyOfA = keys.get('user-a');

    expect(keyOfB).not.toBe(keyOfA);
    expect(objects.get(keyOfB!)?.toString('utf8')).toContain('secret of b');
    expect(objects.get(keyOfA!)?.toString('utf8')).not.toContain('secret of b');
  });

  it('stores a queued export under the tenant the job names, even with no tenant around the worker', async () => {
    await processor.process({
      name: EXPORT_GENERATE_JOB,
      data: {
        format: 'csv',
        filename: 'tasks',
        columns: ['title'],
        rows: [{ title: 'queued' }],
        userId: 'user-q',
        tenantId: 'tenant-q',
      },
    } as Job);

    expect(keys.get('user-q')?.startsWith('tenant-q/')).toBe(true);
  });

  it('refuses a job that names no tenant rather than storing it outside every tenant', async () => {
    await processor.process({
      name: EXPORT_GENERATE_JOB,
      data: {
        format: 'csv',
        filename: 'tasks',
        columns: ['title'],
        rows: [{ title: 'orphan' }],
        userId: 'user-orphan',
      },
    } as Job);

    expect(keys.has('user-orphan')).toBe(false);
  });

  it('stamps the queuing tenant on the job', async () => {
    const dispatchTo = jest.fn().mockResolvedValue(undefined);
    const service = new ExportService(
      {
        resolve: () => new CsvExportDriver(),
        defaultKeyword: 'csv',
      } as unknown as ExportDriverRegistry,
      { dispatchTo } as unknown as JobsService,
    );

    await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      service
        .as('csv')
        .queue(
          { filename: 'tasks', columns: ['title'], rows: () => [] },
          'user-a',
        ),
    );

    expect(dispatchTo).toHaveBeenCalledWith(
      expect.anything(),
      EXPORT_GENERATE_JOB,
      expect.objectContaining({ tenantId: 'tenant-a', userId: 'user-a' }),
      expect.anything(),
    );
  });
});
