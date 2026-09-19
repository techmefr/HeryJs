import { Injectable } from '@nestjs/common';
import { IMPORT_QUEUE } from '#kernel/jobs/jobs.constants';
import { JobsService } from '#kernel/jobs/jobs.service';
import type { Importable, ImportOutcome } from '#kernel/import/import-driver';
import { IMPORT_CONSUME_JOB, IMPORT_CONSUME_POLICY } from './import.constants';
import { ImportDriverRegistry } from './import-driver.registry';
import { mergeOutcome, partitionRows } from './import-rows.validator';

/**
 * What `Import.from('csv')` returns, mirroring `BoundExport`: a driver already
 * chosen, and the two things worth doing with it. A plain object rather than an
 * injectable, because it lives for one call and holds no state the container
 * could own.
 */
export interface BoundImport {
  read(body: Buffer, importable: Importable): Promise<ImportOutcome>;
  queue(key: string, importable: Importable, userId: string): Promise<void>;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly registry: ImportDriverRegistry,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Omitting the format means import.default from hery.config.ts, so a caller
   * whose upload endpoint only ever accepts one kind of file never names one.
   */
  from(format?: string): BoundImport {
    const driver = this.registry.resolve(format);

    return {
      read: async (body, importable) => {
        const parsed = await driver.parse(body);
        const { valid, errors } = partitionRows(parsed, importable.columns);
        const consumed = await importable.consume(valid);

        return mergeOutcome(consumed, errors, parsed.length - valid.length);
      },

      /**
       * Parsing happens in the worker, because parsing is the expensive half --
       * a hundred-thousand-row spreadsheet is what blocks a request, not the
       * upload that delivered it. That is the same split export makes, from the
       * other end.
       *
       * The job carries a storage key rather than the file body: the caller
       * writes the upload to storage first, and the worker reads it back
       * through the storage contract when the job runs.
       */
      queue: async (key, importable, userId) => {
        await this.jobs.dispatchTo(
          IMPORT_QUEUE,
          IMPORT_CONSUME_JOB,
          {
            format: format ?? this.registry.defaultKeyword,
            importable: importable.name,
            key,
            userId,
          },
          IMPORT_CONSUME_POLICY,
        );
      },
    };
  }

  get formats(): string[] {
    return this.registry.formats;
  }
}
