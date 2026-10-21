import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalJson } from './canonical-json';

const REDACTION_BATCH_SIZE = 500;
const RECORD_ID_CHUNK_SIZE = 1000;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export type RedactedAuditData = {
  redacted: true;
  digest: string;
};

type AuditRedactionClient = Pick<PrismaClient, 'auditLog'>;

export interface AuditRedactionScope {
  tenantId: string;
  models: readonly string[];
  // Absent means every entry of those models in the tenant -- a tenant erasure.
  recordIds?: readonly string[];
}

/**
 * What an entry's `data` becomes once an erasure removed the row it described:
 * a marker and the SHA-256 of the canonical JSON it replaces. The digest is
 * enough to prove later that a given payload is the one that was here, and the
 * payload itself is gone.
 */
export function redactedAuditData(original: unknown): RedactedAuditData {
  return {
    redacted: true,
    digest: createHash('sha256').update(canonicalJson(original)).digest('hex'),
  };
}

export function isRedactedAuditData(
  value: unknown,
): value is RedactedAuditData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    Object.keys(candidate).length === 2 &&
    candidate.redacted === true &&
    typeof candidate.digest === 'string' &&
    DIGEST_PATTERN.test(candidate.digest)
  );
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
}

async function redactMatching(
  client: AuditRedactionClient,
  where: Record<string, unknown>,
): Promise<number> {
  let redacted = 0;

  for (;;) {
    const entries = await client.auditLog.findMany({
      where: { ...where, redactedAt: null },
      orderBy: { sequence: 'asc' },
      take: REDACTION_BATCH_SIZE,
      select: { id: true, data: true },
    });

    if (entries.length === 0) {
      return redacted;
    }

    const redactedAt = new Date();

    for (const entry of entries) {
      await client.auditLog.update({
        where: { id: entry.id },
        data: { data: redactedAuditData(entry.data), redactedAt },
      });
    }

    redacted += entries.length;
  }
}

/**
 * Replaces the payload of every audit entry that described an erased row.
 * Nothing else about an entry changes -- not its hash, not its links, not who
 * acted or when -- so the chain keeps its shape and the verifier keeps
 * accepting it, while the personal data it carried is gone.
 */
export async function redactAuditEntries(
  client: AuditRedactionClient,
  scope: AuditRedactionScope,
): Promise<number> {
  if (scope.models.length === 0) {
    return 0;
  }

  const base = { tenantId: scope.tenantId, model: { in: [...scope.models] } };

  if (scope.recordIds === undefined) {
    return redactMatching(client, base);
  }

  let redacted = 0;

  for (const recordIds of chunked(scope.recordIds, RECORD_ID_CHUNK_SIZE)) {
    redacted += await redactMatching(client, {
      ...base,
      recordId: { in: recordIds },
    });
  }

  return redacted;
}
