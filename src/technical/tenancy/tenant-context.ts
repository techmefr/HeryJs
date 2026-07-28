import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
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
};
