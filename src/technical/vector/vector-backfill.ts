import { VectorIndexer } from './vector-indexer';
import { VectorStore } from './vector-store';
import type { VectorTarget } from './vector-target';

export const DEFAULT_BACKFILL_BATCH = 100;

export interface BackfillOptions {
  tenantId?: string;
  batchSize?: number;
  isDryRun?: boolean;
}

export interface BackfillReport {
  tenants: number;
  missing: number;
  embedded: number;
  failed: { id: string; tenantId: string; reason: string }[];
}

export class VectorBackfill {
  constructor(
    private readonly store: VectorStore,
    private readonly indexer: VectorIndexer,
  ) {}

  async run(
    target: VectorTarget,
    options: BackfillOptions = {},
  ): Promise<BackfillReport> {
    const batchSize = options.batchSize ?? DEFAULT_BACKFILL_BATCH;
    const tenants = options.tenantId
      ? [options.tenantId]
      : await this.store.tenantIds();
    const report: BackfillReport = {
      tenants: tenants.length,
      missing: 0,
      embedded: 0,
      failed: [],
    };

    for (const tenantId of tenants) {
      await this.runTenant(target, tenantId, batchSize, options, report);
    }

    return report;
  }

  private async runTenant(
    target: VectorTarget,
    tenantId: string,
    batchSize: number,
    options: BackfillOptions,
    report: BackfillReport,
  ): Promise<void> {
    let afterId: string | null = null;

    for (;;) {
      const ids = await this.store.missingEmbeddings(
        target,
        tenantId,
        afterId,
        batchSize,
      );

      if (ids.length === 0) {
        return;
      }

      report.missing += ids.length;

      for (const id of ids) {
        await this.embedOne(target, id, tenantId, options, report);
      }

      afterId = ids[ids.length - 1] ?? null;
    }
  }

  private async embedOne(
    target: VectorTarget,
    id: string,
    tenantId: string,
    options: BackfillOptions,
    report: BackfillReport,
  ): Promise<void> {
    if (options.isDryRun) {
      return;
    }

    try {
      await this.indexer.embedRecord(target, id, tenantId);
      report.embedded += 1;
    } catch (error) {
      report.failed.push({
        id,
        tenantId,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
