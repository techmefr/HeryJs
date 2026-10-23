import { Injectable } from '@nestjs/common';
import { env } from '#technical/config/env';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { STORAGE_MODULE } from '#technical/storage/storage-driver';
import type { StorageDriver } from '#technical/storage/storage-driver';
import { FileErasureJournal, StorageErasureJournal } from './erasure-journal';
import type {
  ErasureJournal,
  ErasureJournalEntry,
  JournalErasureKind,
} from './erasure-journal';
import { PrivacyExecutor } from './privacy.executor';

export interface ReplayOutcome {
  replayed: number;
  skipped: number;
}

/**
 * Restoring a dump taken before an erasure brings the erased rows back. Every
 * completed erasure is journaled outside the database, and the journal is run
 * again after each restore: an erasure finds nothing left to erase when the
 * dump was already clean, so replaying the whole journal is always safe.
 */
@Injectable()
export class ErasureReplay {
  constructor(
    private readonly executor: PrivacyExecutor,
    private readonly drivers: DriverResolver,
  ) {}

  async record(
    kind: JournalErasureKind,
    tenantId: string,
    subjectId: string,
    keptUserId: string | null,
  ): Promise<void> {
    await this.journal().append({
      kind,
      tenantId,
      subjectId,
      keptUserId,
      erasedAt: new Date().toISOString(),
    });
  }

  async replay(): Promise<ReplayOutcome> {
    const outcome: ReplayOutcome = { replayed: 0, skipped: 0 };

    for (const entry of await this.journal().read()) {
      if (await this.replayOne(entry)) {
        outcome.replayed += 1;
      } else {
        outcome.skipped += 1;
      }
    }

    return outcome;
  }

  /**
   * A local file does not survive a redeploy off a volume and is seen by one
   * instance only, so production names a storage driver (S3, MinIO) and every
   * instance journals to, and replays from, the same bucket.
   */
  private journal(): ErasureJournal {
    const driverName = env.PRIVACY_ERASURE_STORAGE_DRIVER;

    if (!driverName) {
      return new FileErasureJournal(env.PRIVACY_ERASURE_JOURNAL);
    }

    const driver = this.drivers.find<StorageDriver>(STORAGE_MODULE, driverName);

    if (!driver) {
      throw new Error(
        `PRIVACY_ERASURE_STORAGE_DRIVER is "${driverName}", but no storage driver of that name is installed.`,
      );
    }

    return new StorageErasureJournal(driver);
  }

  private async replayOne(entry: ErasureJournalEntry): Promise<boolean> {
    try {
      await runInTenant(entry.tenantId, async () => {
        if (entry.kind === 'erase-user') {
          await this.executor.eraseUser(entry.tenantId, entry.subjectId);
        } else {
          await this.executor.eraseTenant(entry.tenantId, entry.keptUserId);
        }
      });

      return true;
    } catch (error) {
      // A dump older than the account holds no such user: nothing to erase.
      if (error instanceof RecordNotFoundException) {
        return false;
      }

      throw error;
    }
  }
}
