import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { env } from '#technical/config/env';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { ErasureReplay } from '#technical/privacy/erasure-replay';
import { STORAGE_MODULE } from '#technical/storage/storage-driver';
import type { StorageDriver } from '#technical/storage/storage-driver';
import { BackupNotFoundException } from './backup.exceptions';
import { BackupSettingsStore } from './backup-settings';
import {
  createBackup,
  databaseNameOf,
  listBackups,
  parseBackupName,
  restoreBackup,
} from './database-backup';
import type { BackupFile } from './database-backup';

const REMOTE_PREFIX = 'backups';
const CONTENT_TYPE = 'application/octet-stream';

export interface BackupRow {
  name: string;
  createdAt: string;
  sizeBytes: number;
  status: 'available';
}

@Injectable()
export class BackupService {
  constructor(
    private readonly settings: BackupSettingsStore,
    private readonly drivers: DriverResolver,
    private readonly erasures: ErasureReplay,
  ) {}

  async list(): Promise<BackupRow[]> {
    const files = await listBackups(
      env.BACKUP_DIR,
      databaseNameOf(env.DATABASE_URL),
    );

    return files.map(rowOf);
  }

  async create(): Promise<BackupRow> {
    const driver = this.storageDriver();
    const { keep } = await this.settings.get();
    const result = await createBackup({
      databaseUrl: env.DATABASE_URL,
      directory: env.BACKUP_DIR,
      keep,
    });

    if (driver) {
      await driver.put(
        `${REMOTE_PREFIX}/${result.file.name}`,
        await readFile(result.path),
        CONTENT_TYPE,
      );
    }

    return rowOf(result.file);
  }

  /**
   * A name is only ever looked up in the list of this database's own dumps,
   * never joined onto the directory as given: a request for `../../etc/passwd`
   * is a 404 for a file that is not a backup, not a read.
   */
  async pathOf(name: string): Promise<string> {
    const known = (await this.list()).some((row) => row.name === name);

    if (!known || name !== path.basename(name) || !parseBackupName(name)) {
      throw new BackupNotFoundException(name);
    }

    return path.join(env.BACKUP_DIR, name);
  }

  async restore(name: string): Promise<void> {
    await restoreBackup({
      databaseUrl: env.DATABASE_URL,
      file: await this.pathOf(name),
      isForced: true,
    });
    await this.erasures.replay();
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

function rowOf(file: BackupFile): BackupRow {
  return {
    name: file.name,
    createdAt: file.createdAt.toISOString(),
    sizeBytes: file.sizeBytes,
    status: 'available',
  };
}
