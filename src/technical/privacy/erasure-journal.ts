import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageDriver } from '#technical/storage/storage-driver';

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
 * The journal lives beside the database, never in it: a restore replaces
 * every table with the dump's copy, so a journal kept in a table would be
 * rolled back together with the erasures it records.
 */
export interface ErasureJournal {
  append(entry: ErasureJournalEntry): Promise<void>;
  read(): Promise<ErasureJournalEntry[]>;
}

/**
 * The development fallback: a file on the instance's own disk, lost with the
 * container unless it sits on a volume, and seen by that instance alone.
 */
export class FileErasureJournal implements ErasureJournal {
  constructor(private readonly file: string) {}

  async append(entry: ErasureJournalEntry): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }

  async read(): Promise<ErasureJournalEntry[]> {
    let content: string;

    try {
      content = await readFile(this.file, 'utf8');
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
}

const STORAGE_PREFIX = 'privacy/erasures/';
const CONTENT_TYPE = 'application/json';

/**
 * One object per erasure rather than one appended file: an object store has
 * no append, and two instances rewriting a shared file would each drop the
 * entry the other had just added.
 */
export class StorageErasureJournal implements ErasureJournal {
  constructor(private readonly driver: StorageDriver) {}

  async append(entry: ErasureJournalEntry): Promise<void> {
    await this.driver.put(
      `${STORAGE_PREFIX}${entry.erasedAt}-${randomUUID()}.json`,
      Buffer.from(JSON.stringify(entry)),
      CONTENT_TYPE,
    );
  }

  async read(): Promise<ErasureJournalEntry[]> {
    const objects = await this.driver.list(
      STORAGE_PREFIX,
      Number.MAX_SAFE_INTEGER,
    );
    const entries = await Promise.all(
      objects.map(
        async ({ key }) =>
          JSON.parse(
            (await this.driver.get(key)).toString('utf8'),
          ) as ErasureJournalEntry,
      ),
    );

    return entries.sort((a, b) => a.erasedAt.localeCompare(b.erasedAt));
  }
}
