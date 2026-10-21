import { isAllowed, mutateIds, summarize } from './resource';
import type { Decisions, ResourceRow } from './resource';

export type BulkKind = 'delete' | 'hardDelete' | 'restore';

export interface BulkPlan {
  kind: BulkKind;
  eligible: string[];
  skipped: string[];
}

export interface BulkOutcome {
  succeeded: string[];
  failed: { id: string; message: string }[];
  skipped: string[];
}

const ROW_CAPABILITY: Record<BulkKind, string> = {
  delete: 'delete',
  hardDelete: 'delete',
  restore: 'restore',
};

export function planBulk(
  kind: BulkKind,
  rows: ResourceRow[],
  selected: Set<string>,
  collection: Decisions | undefined,
): BulkPlan {
  const chosen = rows.filter((row) => selected.has(row.id));
  const isCollectionAllowed =
    kind !== 'hardDelete' || isAllowed(collection, 'hardDelete');
  const eligible = chosen
    .filter(
      (row) =>
        isCollectionAllowed &&
        isAllowed(row.capabilities, ROW_CAPABILITY[kind]),
    )
    .map((row) => row.id);
  const allowed = new Set(eligible);

  return {
    kind,
    eligible,
    skipped: chosen.map((row) => row.id).filter((id) => !allowed.has(id)),
  };
}

export async function runBulk(
  base: string,
  plan: BulkPlan,
): Promise<BulkOutcome> {
  if (plan.eligible.length === 0) {
    return { succeeded: [], failed: [], skipped: plan.skipped };
  }

  const entries =
    plan.kind === 'restore'
      ? await mutateIds(base, 'restore', plan.eligible)
      : await mutateIds(
          base,
          'delete',
          plan.eligible,
          plan.kind === 'hardDelete' ? { mode: 'hard' } : {},
        );

  return { ...summarize(entries), skipped: plan.skipped };
}

export function describeOutcome(
  verb: string,
  outcome: BulkOutcome,
): { message: string; isError: boolean } {
  const parts = [outcome.succeeded.length + ' ' + verb];

  if (outcome.failed.length > 0) {
    parts.push(
      outcome.failed.length +
        ' refused (' +
        outcome.failed.map((item) => item.id + ': ' + item.message).join('; ') +
        ')',
    );
  }

  if (outcome.skipped.length > 0) {
    parts.push(outcome.skipped.length + ' skipped, not permitted');
  }

  return {
    message: parts.join(', '),
    isError: outcome.failed.length > 0 || outcome.skipped.length > 0,
  };
}
