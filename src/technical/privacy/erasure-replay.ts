import { Injectable } from '@nestjs/common';
import { env } from '#technical/config/env';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { appendErasure, readErasures } from './erasure-journal';
import type {
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
  constructor(private readonly executor: PrivacyExecutor) {}

  record(
    kind: JournalErasureKind,
    tenantId: string,
    subjectId: string,
    keptUserId: string | null,
  ): Promise<void> {
    return appendErasure(env.PRIVACY_ERASURE_JOURNAL, {
      kind,
      tenantId,
      subjectId,
      keptUserId,
      erasedAt: new Date().toISOString(),
    });
  }

  async replay(): Promise<ReplayOutcome> {
    const outcome: ReplayOutcome = { replayed: 0, skipped: 0 };

    for (const entry of await readErasures(env.PRIVACY_ERASURE_JOURNAL)) {
      if (await this.replayOne(entry)) {
        outcome.replayed += 1;
      } else {
        outcome.skipped += 1;
      }
    }

    return outcome;
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
