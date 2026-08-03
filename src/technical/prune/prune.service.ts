import { Injectable } from '@nestjs/common';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { PruneNotConfiguredException } from '#technical/errors/prune-not-configured.exception';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { prunableModels } from './prunable-models';
import { resolvePruneRule } from './prune.config';
import type { ResolvedPruneRule } from './prune.config';

const DAY_MS = 24 * 60 * 60 * 1000;

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

// The scheduled path has no caller to attribute the write to; pruneNow's
// caller is read from the request's own tenant context instead.
const SYSTEM_ACTOR: PruneActor = { userId: null, impersonatedBy: null };

function delegateFor(model: string): PrunableDelegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  // model always comes from prunableModels(), Prisma's own DMMF -- the
  // delegate for a model it just named always exists on the client.
  return (authPrismaClient as unknown as Record<string, PrunableDelegate>)[
    key
  ]!;
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
    const delegate = delegateFor(model);

    // Read the exact rows first, and delete by id rather than repeating the
    // cutoff filter: the audit log is written per tenant, and a bulk
    // deleteMany's result only carries a count, never which tenants it
    // touched.
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

    const countByTenant = new Map<string, number>();

    for (const row of rows) {
      countByTenant.set(
        row.tenantId,
        (countByTenant.get(row.tenantId) ?? 0) + 1,
      );
    }

    for (const [tenantId, count] of countByTenant) {
      await writeAuditLog(authPrismaClient, {
        tenantId,
        model,
        operation: 'prune',
        recordId: null,
        data: { count },
        userId: actor.userId,
        impersonatedBy: actor.impersonatedBy,
      });
    }

    return { model, deletedCount: rows.length };
  }

  async pruneNow(model: string): Promise<PruneRunResult> {
    const rule = resolvePruneRule(model);

    if (!prunableModels().includes(model) || !rule) {
      throw new PruneNotConfiguredException(model);
    }

    return this.pruneModel(model, rule, {
      userId: TenantContextStorage.getUserId(),
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    });
  }

  // The scheduler's own path: every prunable model with a rule, except one
  // whose rule opts out of the automatic run -- `lock` means "an admin
  // decides when", not "nobody may ever", so pruneNow still reaches it.
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
