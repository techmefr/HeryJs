import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Job } from 'bullmq';
import { DriverResolver } from '#kernel/drivers/driver-resolver';
import { IMPORT_QUEUE } from '#kernel/jobs/jobs.constants';
import { NOTIFICATION_PROVIDER } from '#kernel/notifications/notification.types';
import type { NotificationProvider } from '#kernel/notifications/notification.types';
import { importableToken } from '#kernel/import/import-driver';
import type { Importable } from '#kernel/import/import-driver';
import { STORAGE_MODULE } from '#kernel/storage/storage-driver';
import type { StorageDriver } from '#kernel/storage/storage-driver';
import {
  IMPORT_CONSUME_JOB,
  IMPORT_DONE_NOTIFICATION,
} from './import.constants';
import { ImportDriverRegistry } from './import-driver.registry';
import { mergeOutcome, partitionRows } from './import-rows.validator';

interface ImportJobData {
  format: string;
  importable: string;
  key: string;
  userId: string;
}

@Processor(IMPORT_QUEUE)
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger('Import');

  constructor(
    private readonly registry: ImportDriverRegistry,
    private readonly moduleRef: ModuleRef,
    private readonly resolver: DriverResolver,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifications: NotificationProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== IMPORT_CONSUME_JOB) {
      return;
    }

    const { format, importable, key, userId } = job.data as ImportJobData;

    const target = this.find(importable);

    if (!target) {
      this.logger.error(
        `Queued import named "${importable}" but nothing is bound under importableToken("${importable}"). Provide the importable in the module that dispatches it.`,
      );
      return;
    }

    const storage = this.resolver.find<StorageDriver>(STORAGE_MODULE, 'local');

    if (!storage) {
      this.logger.error(
        `Queued import named "${importable}" but no storage driver is installed to read key "${key}" back. Run "pnpm hery install storage".`,
      );
      return;
    }

    const body = await storage.get(key);
    const driver = this.registry.resolve(format);
    const parsed = await driver.parse(body);
    const { valid, errors } = partitionRows(parsed, target.columns);
    const consumed = await target.consume(valid);
    const outcome = mergeOutcome(
      consumed,
      errors,
      parsed.length - valid.length,
    );

    /**
     * The notification goes out whether or not every row landed. An import
     * that rejected half a file still finished, and telling the user only
     * about the successes is how a missing record is discovered a month later
     * by the person who needed it.
     */
    await this.notifications.send(userId, IMPORT_DONE_NOTIFICATION, {
      importable,
      rows: parsed.length,
      accepted: outcome.accepted,
      rejected: outcome.rejected,
      errors: outcome.errors,
    });
  }

  /**
   * The importable is looked up through the global symbol registry rather than
   * imported, for the reason a driver is: the class lives in
   * `src/functional/`, which this module may not reach into, and binding it by
   * name is what keeps the queued path working without the module knowing any
   * application code exists.
   */
  private find(name: string): Importable | undefined {
    try {
      return this.moduleRef.get<Importable>(importableToken(name), {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }
}
