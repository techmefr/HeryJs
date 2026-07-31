import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalJson } from './canonical-json';

export const AUDITED_MODELS = new Set(['Workout']);
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

interface AuditEntryInput {
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

function computeHash(previousHash: string | null, entry: AuditEntryInput) {
  return createHash('sha256')
    .update(previousHash ?? '')
    .update(canonicalJson(entry))
    .digest('hex');
}

export async function writeAuditLog(
  client: PrismaClient,
  entry: AuditEntryInput,
) {
  const last = await client.auditLog.findFirst({
    where: { tenantId: entry.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  const previousHash = last?.hash ?? null;
  const hash = computeHash(previousHash, entry);

  await client.auditLog.create({
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
