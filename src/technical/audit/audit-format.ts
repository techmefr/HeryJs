import type { AuditLog } from '@prisma/client';

export const AUDIT_EXPORT_FORMATS = ['csv', 'jsonl'] as const;

export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number];

export const AUDIT_CSV_COLUMNS = [
  'sequence',
  'createdAt',
  'tenantId',
  'model',
  'operation',
  'recordId',
  'userId',
  'impersonatedBy',
  'data',
  'previousHash',
  'hash',
] as const;

export const AUDIT_CONTENT_TYPES: Record<AuditExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  jsonl: 'application/x-ndjson; charset=utf-8',
};

// A spreadsheet reads a cell starting with one of these as a formula, and an
// audit entry carries text a user typed. The prefix turns it back into text.
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const safe =
    typeof value === 'string' && FORMULA_PREFIXES.has(text.charAt(0))
      ? `'${text}`
      : text;

  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * The entry as it leaves the system. Every field the hash covers is here, plus
 * the two hashes themselves, so a file is checkable by anyone who can recompute
 * the canonical form without ever calling the API back.
 */
export function auditEntryRecord(entry: AuditLog): Record<string, unknown> {
  return {
    sequence: entry.sequence,
    createdAt: entry.createdAt.toISOString(),
    tenantId: entry.tenantId,
    model: entry.model,
    operation: entry.operation,
    recordId: entry.recordId,
    userId: entry.userId,
    impersonatedBy: entry.impersonatedBy,
    data: entry.data,
    previousHash: entry.previousHash,
    hash: entry.hash,
  };
}

export function auditCsvHeader(): string {
  return `${AUDIT_CSV_COLUMNS.join(',')}\n`;
}

export function auditLines(
  entries: AuditLog[],
  format: AuditExportFormat,
): string {
  return entries
    .map((entry) => {
      const record = auditEntryRecord(entry);

      return format === 'jsonl'
        ? `${JSON.stringify(record)}\n`
        : `${AUDIT_CSV_COLUMNS.map((column) => csvCell(record[column])).join(',')}\n`;
    })
    .join('');
}
