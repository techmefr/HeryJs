import { appendFile, mkdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

export type JournalErasureKind = 'erase-user' | 'erase-tenant';

/**
 * One completed erasure, as identifiers only: the tenant, the user it was
 * about and, for a tenant erasure, the account that was kept. Replaying it
 * needs nothing else, and a journal that held an address or a name would be
 * the very copy the erasure was meant to remove.
 */
export interface ErasureJournalEntry {
  kind: JournalErasureKind;
  tenantId: string;
  subjectId: string;
  keptUserId: string | null;
  erasedAt: string;
}

/**
 * The journal lives in a file beside the database, never in it: a restore
 * replaces every table with the dump's copy, so a journal kept in a table
 * would be rolled back together with the erasures it records.
 */
export async function appendErasure(
  file: string,
  entry: ErasureJournalEntry,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

export async function readErasures(
  file: string,
): Promise<ErasureJournalEntry[]> {
  let content: string;

  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return content
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ErasureJournalEntry);
}
