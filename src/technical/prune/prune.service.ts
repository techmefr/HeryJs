import { Injectable } from '@nestjs/common';
import { writeAuditLogInTransaction } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { heryConfig } from '#technical/config/hery-config';
import {
  ExposeAction,
  ExposeField,
} from '#technical/exposition/exposition.decorators';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { prunableModels } from './prunable-models';
import { canManagePrune } from './prune.policy';
import { resolvePruneRule } from './prune.config';
import type { ResolvedPruneRule } from './prune.config';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = heryConfig.prune?.default.retentionDays ?? 30;

export interface PruneModelStatus extends ResolvedPruneRule {
  model: string;
}

export interface PruneRunResult {
  model: string;
  deletedCount: number;
}

interface PrunableRow {
  id: string;
  tenantId: string;
}

interface PrunableDelegate {
  findMany(args: unknown): Promise<PrunableRow[]>;
  deleteMany(args: unknown): Promise<{ count: number }>;
}

interface PruneActor {
  userId: string | null;
  impersonatedBy: string | null;
}

// The scheduled path has no caller to attribute the write to; run's caller is
// read from the request's own tenant context instead.
const SYSTEM_ACTOR: PruneActor = { userId: null, impersonatedBy: null };

function delegateFor(client: object, model: string): PrunableDelegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  // model always comes from prunableModels(), Prisma's own DMMF -- the
  // delegate for a model it just named always exists on the client.
  return (client as unknown as Record<string, PrunableDelegate>)[key]!;
}

/**
 * Hard-deletes rows already soft-deleted longer ago than the model's
 * configured retention. This is the one place in the codebase allowed to
 * bypass tenant scoping across every tenant at once -- pruning is a system
 * job, not a request on anyone's behalf, so it runs on authPrismaClient the
 * same way audit-log and impersonation writes do.
 */
@Injectable()
export class PruneService {
  @ExposeAction('prune.status', { capability: canManagePrune })
  status(): PruneModelStatus[] {
    return prunableModels()
      .map((model) => ({ model, rule: resolvePruneRule(model) }))
      .filter(
        (entry): entry is { model: string; rule: ResolvedPruneRule } =>
          entry.rule !== null,
      )
      .map(({ model, rule }) => ({ model, ...rule }));
  }

  async pruneModel(
    model: string,
    rule: ResolvedPruneRule,
    actor: PruneActor = SYSTEM_ACTOR,
  ): Promise<PruneRunResult> {
    const cutoff = new Date(Date.now() - rule.retentionDays * DAY_MS);

    return authPrismaClient.$transaction(async (tx) => {
      const delegate = delegateFor(tx, model);

      // Read the exact rows first, and delete by id rather than repeating
      // the cutoff filter: the audit log is written per tenant, and a bulk
      // deleteMany's result only carries a count, never which tenants or
      // which rows it touched.
      const rows = await delegate.findMany({
        where: { deletedAt: { not: null, lt: cutoff } },
        select: { id: true, tenantId: true },
      });

      if (rows.length === 0) {
        return { model, deletedCount: 0 };
      }

      await delegate.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });

      const idsByTenant = new Map<string, string[]>();

      for (const row of rows) {
        const ids = idsByTenant.get(row.tenantId) ?? [];
        ids.push(row.id);
        idsByTenant.set(row.tenantId, ids);
      }

      for (const [tenantId, ids] of idsByTenant) {
        await writeAuditLogInTransaction(tx, {
          tenantId,
          model,
          operation: 'prune',
          recordId: null,
          data: { ids },
          userId: actor.userId,
          impersonatedBy: actor.impersonatedBy,
        });
      }

      return { model, deletedCount: rows.length };
    });
  }

  @ExposeAction('prune.run', { capability: canManagePrune })
  async run(
    @ExposeField('prune.run.model', {
      kind: 'enum',
      values: prunableModels(),
      default: prunableModels()[0] ?? '',
    })
    model: string,
    @ExposeField('prune.run.retentionDays', {
      kind: 'number',
      min: 1,
      max: 3650,
      default: DEFAULT_RETENTION_DAYS,
    })
    retentionDays: number,
  ): Promise<PruneRunResult> {
    return this.pruneModel(
      model,
      { retentionDays, lock: false },
      {
        userId: TenantContextStorage.getUserId(),
        impersonatedBy: TenantContextStorage.getImpersonatedBy(),
      },
    );
  }

  // The scheduler's own path: every prunable model with a rule, except one
  // whose rule opts out of the automatic run -- `lock` means "an admin
  // decides when", not "nobody may ever", so run() still reaches it.
  async pruneDue(): Promise<PruneRunResult[]> {
    const results: PruneRunResult[] = [];

    for (const model of prunableModels()) {
      const rule = resolvePruneRule(model);

      if (!rule || rule.lock) {
        continue;
      }

      results.push(await this.pruneModel(model, rule));
    }

    return results;
  }
}
