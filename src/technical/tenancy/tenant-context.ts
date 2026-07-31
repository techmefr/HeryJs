import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  // Absent in call sites that only care about tenant scoping (tests, the
  // reindex/seed CLI backfills) -- those have no session to attribute a
  // write to, so the audit log degrades to a null actor there rather than
  // requiring every caller to invent one.
  userId?: string | null;
  impersonatedBy?: string | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const TenantContextStorage = {
  run<T>(context: TenantContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  getTenantId(): string {
    const context = storage.getStore();

    if (!context) {
      throw new Error('No tenant context available outside of a request');
    }

    return context.tenantId;
  },

  getUserId(): string | null {
    const context = storage.getStore();

    if (!context) {
      throw new Error('No tenant context available outside of a request');
    }

    return context.userId ?? null;
  },

  getImpersonatedBy(): string | null {
    const context = storage.getStore();

    if (!context) {
      throw new Error('No tenant context available outside of a request');
    }

    return context.impersonatedBy ?? null;
  },
};
