import { AsyncLocalStorage } from 'node:async_hooks';
import type { HistoryOperation } from './history.types';

const storage = new AsyncLocalStorage<HistoryOperation>();

/**
 * Lets a caller say what the write it is about to make means. Prisma only
 * reports "update", and a revert is an update that history should name as one:
 * the service wraps its write here rather than the extension guessing.
 */
export const HistoryOperationStorage = {
  run<T>(operation: HistoryOperation, callback: () => T): T {
    return storage.run(operation, callback);
  },

  current(): HistoryOperation | null {
    return storage.getStore() ?? null;
  },
};
