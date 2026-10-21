import type { Prisma } from '@prisma/client';
import { writeAuditLogInTransaction } from '#technical/audit/audit-log';
import { IllegalTransitionException } from '#technical/errors/illegal-transition.exception';
import { TransitionGuardException } from '#technical/errors/transition-guard.exception';
import { stageOutboxMessages } from '#technical/outbox/outbox-stage';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

/** The outbox message every transition stages, whatever the resource. */
export const WORKFLOW_TRANSITIONED = 'workflow.transitioned';

export interface TransitionRule {
  readonly from: readonly string[];
  readonly to: string;
  readonly requires: readonly string[];
}

export interface TransitionRecord {
  tenantId: string;
  model: string;
  recordId: string;
  transition: string;
  from: string;
  to: string;
}

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * The legality of a move, decided before anything is written: the current
 * state has to be one the transition leaves from, and every field its guard
 * names has to hold a value. Both refuse with a typed error rather than a bare
 * 400, so a client can tell "not from here" from "not yet".
 */
export function assertTransitionAllowed(
  resource: string,
  transition: string,
  rule: TransitionRule,
  record: Record<string, unknown>,
  current: string,
): void {
  if (!rule.from.includes(current)) {
    throw new IllegalTransitionException(
      resource,
      transition,
      current,
      rule.from,
    );
  }

  const missing = rule.requires.filter((field) => isBlank(record[field]));

  if (missing.length > 0) {
    throw new TransitionGuardException(resource, transition, missing);
  }
}

/**
 * The two records a transition leaves besides the row itself: an entry in the
 * hash-chained audit log, and an outbox message the relay delivers to whoever
 * listens (webhooks, handlers). Both go through the transaction the caller
 * already holds, so a transition is never committed without them.
 */
export async function recordTransition(
  tx: Prisma.TransactionClient,
  transition: TransitionRecord,
): Promise<void> {
  const userId = TenantContextStorage.getUserId();
  const impersonatedBy = TenantContextStorage.getImpersonatedBy();

  await writeAuditLogInTransaction(tx, {
    tenantId: transition.tenantId,
    model: transition.model,
    operation: 'transition',
    recordId: transition.recordId,
    data: {
      transition: transition.transition,
      from: transition.from,
      to: transition.to,
    },
    userId,
    impersonatedBy,
  });
  await stageOutboxMessages(tx, [
    {
      tenantId: transition.tenantId,
      name: WORKFLOW_TRANSITIONED,
      payload: { ...transition, userId, impersonatedBy },
    },
  ]);
}
