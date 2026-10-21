import { AsyncLocalStorage } from 'node:async_hooks';
import type { ErrorReportRequest } from './error-reporter-driver';

const storage = new AsyncLocalStorage<ErrorReportRequest>();

export const ErrorRequestContext = {
  run<T>(request: ErrorReportRequest, callback: () => T): T {
    return storage.run(request, callback);
  },

  current(): ErrorReportRequest | null {
    return storage.getStore() ?? null;
  },
};
