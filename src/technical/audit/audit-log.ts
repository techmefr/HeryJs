import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalJson } from './canonical-json';

export const AUDITED_MODELS = new Set(['BlogPost']);
// A bulk operation is still a mutation of an audited model -- `updateMany`/
// `deleteMany`/`upsert` used to be absent from this set, so a single call
// could rewrite or erase every row for a tenant with zero trace in the
// chain. `recordId` degrades to null for these (the result is `{ count }`,
// not a record), but the entry itself, and the count in `data`, is exactly
// what makes the gap visible instead of invisible.
export const AUDITED_OPERATIONS = new Set([
  'create',
  'update',
  'delete',
  'updateMany',
  'deleteMany',
  'upsert',
]);

export interface AuditEntryInput {
  tenantId: string;
  model: string;
  operation: string;
  recordId: string | null;
  data: unknown;
  // Who did this, and, if it happened during an impersonation session, who
  // was really behind it -- without these, a write made by an admin wearing
  // a user's identity is indistinguishable from that user's own write, and
  // the hash chain only proves the entry hasn't been altered, not who it
  // belongs to.
  userId: string | null;
  impersonatedBy: string | null;
}

/**
 * The one shape hashed into the chain. Both the writer and the verifier must
 * call this on the same fields, or a legitimate chain hashes to two different
 * values depending on which side computed it.
 */
export function auditEntryPayload(entry: AuditEntryInput): AuditEntryInput {
  return {
    tenantId: entry.tenantId,
    model: entry.model,
    operation: entry.operation,
    recordId: entry.recordId,
    data: entry.data,
    userId: entry.userId,
    impersonatedBy: entry.impersonatedBy,
  };
}

export const GENESIS_PREVIOUS_HASH = '';

function computeHash(previousHash: string, entry: AuditEntryInput) {
  return createHash('sha256')
    .update(previousHash)
    .update(canonicalJson(auditEntryPayload(entry)))
    .digest('hex');
}

type AuditTransactionClient = Pick<PrismaClient, '$executeRaw' | 'auditLog'>;

/**
 * The advisory lock and the hash-chain append, usable both standalone
 * (`writeAuditLog`, which opens its own transaction) and from inside a
 * transaction a caller already holds -- Prisma's interactive transaction
 * client has no `$transaction` of its own to nest one into.
 */
export async function writeAuditLogInTransaction(
  tx: AuditTransactionClient,
  entry: AuditEntryInput,
): Promise<void> {
  // Reading the chain's tail and appending to it are two separate statements,
  // so two concurrent mutations on the same tenant can both read the same
  // tail and both append a row claiming it as their predecessor -- a fork the
  // linear verifier can never accept. A transaction alone does not stop this
  // under Postgres's default isolation (each still sees a snapshot without
  // the other's uncommitted row), so the transaction takes a session-scoped
  // advisory lock keyed by tenant first: the second writer blocks until the
  // first commits, and then reads the tail it actually produced.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entry.tenantId}))`;

  const last = await tx.auditLog.findFirst({
    where: { tenantId: entry.tenantId },
    orderBy: { sequence: 'desc' },
  });

  const previousHash = last?.hash ?? GENESIS_PREVIOUS_HASH;
  const hash = computeHash(previousHash, entry);

  await tx.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      model: entry.model,
      operation: entry.operation,
      recordId: entry.recordId,
      data: entry.data as object,
      userId: entry.userId,
      impersonatedBy: entry.impersonatedBy,
      hash,
      previousHash,
    },
  });
}

export async function writeAuditLog(
  client: PrismaClient,
  entry: AuditEntryInput,
): Promise<void> {
  await client.$transaction((tx) => writeAuditLogInTransaction(tx, entry));
}
