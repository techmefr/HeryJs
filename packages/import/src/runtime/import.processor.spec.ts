import type { ModuleRef } from '@nestjs/core';
import type { Job } from 'bullmq';
import { DriverResolver } from '#kernel/drivers/driver-resolver';
import type { Importable } from '#kernel/import/import-driver';
import type { NotificationProvider } from '#kernel/notifications/notification.types';
import type { StorageDriver } from '#kernel/storage/storage-driver';
import { CsvImportDriver } from './csv-import.driver';
import {
  IMPORT_CONSUME_JOB,
  IMPORT_DONE_NOTIFICATION,
} from './import.constants';
import { ImportDriverRegistry } from './import-driver.registry';
import { ImportProcessor } from './import.processor';

const csvDriver = new CsvImportDriver();

class FakeModuleRef {
  constructor(private readonly importable: Importable | undefined) {}

  get<T>(): T {
    if (!this.importable) {
      throw new Error('no provider');
    }
    return this.importable as unknown as T;
  }
}

class FakeResolver {
  constructor(private readonly storage: StorageDriver | undefined) {}

  find<T>(): T | undefined {
    return this.storage as unknown as T | undefined;
  }
}

function buildRegistry(): ImportDriverRegistry {
  const registry = new ImportDriverRegistry(
    {},
    csvDriver,
    new DriverResolver({} as unknown as ModuleRef),
  );
  registry.onModuleInit();
  return registry;
}

function buildJob(overrides: Partial<Record<string, unknown>> = {}): Job {
  return {
    name: IMPORT_CONSUME_JOB,
    data: {
      format: 'csv',
      importable: 'tasks',
      key: 'uploads/tasks.csv',
      userId: 'user-1',
      ...overrides,
    },
  } as Job;
}

describe('ImportProcessor', () => {
  it('reads the uploaded file from storage by key and consumes the parsed rows', async () => {
    const consume = jest.fn().mockResolvedValue({
      accepted: 1,
      rejected: 0,
      errors: [],
    });
    const importable: Importable = {
      name: 'tasks',
      columns: ['title'],
      consume,
    };

    const get = jest.fn().mockResolvedValue(Buffer.from('title\nfirst\n'));
    const storage: StorageDriver = {
      put: jest.fn(),
      get,
      remove: jest.fn(),
      signedUrl: jest.fn(),
    };

    const send = jest.fn().mockResolvedValue(undefined);
    const notifications: NotificationProvider = {
      send,
      listFor: jest.fn(),
      markRead: jest.fn(),
    };

    const processor = new ImportProcessor(
      buildRegistry(),
      new FakeModuleRef(importable) as unknown as ModuleRef,
      new FakeResolver(storage) as unknown as DriverResolver,
      notifications,
    );

    await processor.process(buildJob());

    expect(get).toHaveBeenCalledWith('uploads/tasks.csv');
    expect(consume).toHaveBeenCalledWith([{ title: 'first' }]);
    expect(send).toHaveBeenCalledWith(
      'user-1',
      IMPORT_DONE_NOTIFICATION,
      expect.objectContaining({ importable: 'tasks', accepted: 1 }),
    );
  });

  it('logs and bails when no storage driver is installed to read the key back', async () => {
    const consume = jest.fn();
    const importable: Importable = {
      name: 'tasks',
      columns: ['title'],
      consume,
    };
    const send = jest.fn();
    const notifications: NotificationProvider = {
      send,
      listFor: jest.fn(),
      markRead: jest.fn(),
    };

    const processor = new ImportProcessor(
      buildRegistry(),
      new FakeModuleRef(importable) as unknown as ModuleRef,
      new FakeResolver(undefined) as unknown as DriverResolver,
      notifications,
    );

    await processor.process(buildJob());

    expect(consume).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores jobs meant for another processor', async () => {
    const processor = new ImportProcessor(
      buildRegistry(),
      new FakeModuleRef(undefined) as unknown as ModuleRef,
      new FakeResolver(undefined) as unknown as DriverResolver,
      { send: jest.fn(), listFor: jest.fn(), markRead: jest.fn() },
    );

    await expect(
      processor.process({ name: 'other.job', data: {} } as Job),
    ).resolves.toBeUndefined();
  });
});
