import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { readFile } from 'node:fs/promises';
import { env } from '#technical/config/env';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { STORAGE_MODULE } from '#technical/storage/storage-driver';
import type { StorageDriver } from '#technical/storage/storage-driver';
import { createBackup } from './database-backup';

const TASK_NAME = 'database-backup';
const REMOTE_PREFIX = 'backups';
const CONTENT_TYPE = 'application/octet-stream';

/**
 * Off until BACKUP_ENABLED is "true", and checked before the run is recorded,
 * so a project that never asked for backups does not see a "success" for work
 * that was never done. The cadence is daily at 03:00 on purpose: a project
 * wanting another one overrides this class, the way it would any task.
 *
 * pg_dump has to exist on the machine running the application. The default
 * Node image does not ship it, which is why the task fails loudly instead of
 * skipping when the binary is missing.
 */
@Injectable()
export class BackupTask {
  constructor(
    private readonly store: ScheduledTaskStore,
    private readonly drivers: DriverResolver,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: TASK_NAME })
  async run(): Promise<void> {
    if (!env.BACKUP_ENABLED) {
      return;
    }

    await this.store.run(TASK_NAME, () => this.backup());
  }

  private async backup(): Promise<void> {
    const driver = this.storageDriver();
    const result = await createBackup({
      databaseUrl: env.DATABASE_URL,
      directory: env.BACKUP_DIR,
      keep: env.BACKUP_KEEP,
    });

    if (driver) {
      await driver.put(
        `${REMOTE_PREFIX}/${result.file.name}`,
        await readFile(result.path),
        CONTENT_TYPE,
      );
    }
  }

  private storageDriver(): StorageDriver | undefined {
    if (!env.BACKUP_STORAGE_DRIVER) {
      return undefined;
    }

    const driver = this.drivers.find<StorageDriver>(
      STORAGE_MODULE,
      env.BACKUP_STORAGE_DRIVER,
    );

    if (!driver) {
      throw new Error(
        `BACKUP_STORAGE_DRIVER is "${env.BACKUP_STORAGE_DRIVER}", but no storage driver of that name is installed.`,
      );
    }

    return driver;
  }
}
