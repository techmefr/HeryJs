import { Injectable } from '@nestjs/common';
import { EXPORT_QUEUE } from '#kernel/jobs/jobs.constants';
import { JobsService } from '#kernel/jobs/jobs.service';
import type { Exportable, ExportResult } from '#kernel/export/export-driver';
import {
  EXPORT_GENERATE_JOB,
  EXPORT_GENERATE_POLICY,
} from './export.constants';
import { ExportDriverRegistry } from './export-driver.registry';

/**
 * What `Export.as('pdf')` returns: a driver already chosen, and the two things
 * worth doing with it. It is a plain object rather than an injectable, because
 * it exists for the duration of one call and carries no state the container
 * could usefully own.
 */
export interface BoundExport {
  generate(exportable: Exportable): Promise<ExportResult>;
  queue(exportable: Exportable, userId: string): Promise<void>;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly registry: ExportDriverRegistry,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Omitting the format means export.default from hery.config.ts, so a caller
   * that genuinely does not care never has to name one.
   */
  as(format?: string): BoundExport {
    const driver = this.registry.resolve(format);

    return {
      generate: async (exportable) => ({
        filename: `${exportable.filename}.${driver.extension}`,
        contentType: driver.contentType,
        body: await driver.render(exportable),
      }),

      /**
       * Rows are materialised here and rendering happens in the worker,
       * because rendering is the expensive half -- a spreadsheet or a PDF of
       * ten thousand rows is what blocks a request, not the query that found
       * them. It also keeps the job payload to plain data, which is the only
       * thing a queue can carry.
       *
       * The trade-off is real: those rows travel through Redis. An export
       * large enough for that to hurt wants a job that re-runs the query
       * itself, which means a named exportable rather than an instance.
       */
      queue: async (exportable, userId) => {
        await this.jobs.dispatchTo(
          EXPORT_QUEUE,
          EXPORT_GENERATE_JOB,
          {
            format: format ?? this.registry.defaultKeyword,
            filename: exportable.filename,
            columns: [...exportable.columns],
            rows: await exportable.rows(),
            userId,
          },
          EXPORT_GENERATE_POLICY,
        );
      },
    };
  }

  get formats(): string[] {
    return this.registry.formats;
  }
}
