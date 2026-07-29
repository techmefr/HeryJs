import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalJson } from './canonical-json';

export const AUDITED_MODELS = new Set(['Workout']);
export const AUDITED_OPERATIONS = new Set(['create', 'update', 'delete']);

interface AuditEntryInput {
  tenantId: string;
  model: string;
  operation: string;
  recordId: string | null;
  data: unknown;
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
      hash,
      previousHash,
    },
  });
}
