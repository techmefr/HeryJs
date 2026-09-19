import type { JobsService } from '#kernel/jobs/jobs.service';
import { IMPORT_QUEUE } from '#kernel/jobs/jobs.constants';
import type { Importable } from '#kernel/import/import-driver';
import { CsvImportDriver } from './csv-import.driver';
import { IMPORT_CONSUME_JOB } from './import.constants';
import { ImportDriverRegistry } from './import-driver.registry';
import { ImportService } from './import.service';

function buildRegistry(): ImportDriverRegistry {
  const registry = new ImportDriverRegistry({}, new CsvImportDriver(), {
    find: () => undefined,
  } as never);
  registry.onModuleInit();
  return registry;
}

describe('ImportService.queue', () => {
  it('dispatches the storage key rather than the file body', async () => {
    const dispatchTo = jest.fn().mockResolvedValue(undefined);
    const jobs = { dispatchTo } as unknown as JobsService;
    const importable: Importable = {
      name: 'tasks',
      columns: ['title'],
      consume: jest.fn(),
    };

    const service = new ImportService(buildRegistry(), jobs);

    await service.from('csv').queue('uploads/tasks.csv', importable, 'user-1');

    expect(dispatchTo).toHaveBeenCalledWith(
      IMPORT_QUEUE,
      IMPORT_CONSUME_JOB,
      {
        format: 'csv',
        importable: 'tasks',
        key: 'uploads/tasks.csv',
        userId: 'user-1',
      },
      expect.anything(),
    );
  });
});
