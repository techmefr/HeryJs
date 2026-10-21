import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

export type AfterCommitCallback = () => Promise<void> | void;

export interface AmbientTransaction {
  tx: Prisma.TransactionClient;
  afterCommit: AfterCommitCallback[];
}

const storage = new AsyncLocalStorage<AmbientTransaction>();

export const AmbientTransactionStorage = {
  run<T>(ambient: AmbientTransaction, callback: () => T): T {
    return storage.run(ambient, callback);
  },

  current(): AmbientTransaction | null {
    return storage.getStore() ?? null;
  },

  afterCommit(callback: AfterCommitCallback): Promise<void> | void {
    const ambient = storage.getStore();

    if (!ambient) {
      return callback();
    }

    ambient.afterCommit.push(callback);
  },
};
