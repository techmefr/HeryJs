import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { EXPORT_QUEUE } from '#technical/jobs/jobs.constants';
import { NOTIFICATION_PROVIDER } from '#technical/notifications/notification.types';
import type { NotificationProvider } from '#technical/notifications/notification.types';
import type { ExportRow } from '#technical/export/export-driver';
import { STORAGE_MODULE } from '#technical/storage/storage-driver';
import type { StorageDriver } from '#technical/storage/storage-driver';
import {
  EXPORT_GENERATE_JOB,
  EXPORT_READY_NOTIFICATION,
} from './export.constants';
import { ExportDriverRegistry } from './export-driver.registry';

interface ExportJobData {
  format: string;
  filename: string;
  columns: string[];
  rows: ExportRow[];
  userId: string;
  storage?: string;
}

@Processor(EXPORT_QUEUE)
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger('Export');

  constructor(
    private readonly registry: ExportDriverRegistry,
    private readonly resolver: DriverResolver,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifications: NotificationProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== EXPORT_GENERATE_JOB) {
      return;
    }

    const { format, filename, columns, rows, userId, storage } =
      job.data as ExportJobData;

    const driver = this.registry.resolve(format);
    const name = `${filename}.${driver.extension}`;
    const body = await driver.render({ filename, columns, rows: () => rows });

    const key = await this.store(name, body, driver.contentType, storage);

    await this.notifications.send(userId, EXPORT_READY_NOTIFICATION, {
      filename: name,
      contentType: driver.contentType,
      bytes: body.byteLength,
      rows: rows.length,
      key,
    });
  }

  /**
   * The file is written through the storage *contract*, resolved by token, not
   * through the storage module: a module may not import another module, and
   * making export depend on storage at compile time would mean uninstalling
   * storage breaks every queued export.
   *
   * With no storage driver installed there is nowhere to put the bytes, so the
   * notification goes out with a null key and the reason is logged once. That
   * is a degraded export, not a failed one -- the caller still learns the
   * export finished, and an app that wants the file installs storage.
   */
  private async store(
    name: string,
    body: Buffer,
    contentType: string,
    keyword: string | undefined,
  ): Promise<string | null> {
    const driver = this.resolver.find<StorageDriver>(
      STORAGE_MODULE,
      keyword ?? 'local',
    );

    if (!driver) {
      this.logger.warn(
        `Generated ${name} but no storage driver is installed to keep it. Run "pnpm hery install storage" to have exports persisted.`,
      );
      return null;
    }

    const stored = await driver.put(`exports/${name}`, body, contentType);

    return stored.key;
  }
}
