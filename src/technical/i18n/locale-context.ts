import { AsyncLocalStorage } from 'node:async_hooks';
import { FALLBACK_LOCALE } from './locale.config';

const storage = new AsyncLocalStorage<string>();

/**
 * Unlike TenantContextStorage, a missing context here is not a bug to throw
 * on: plenty of legitimate callers (tests, the CLI, generated batch-route
 * code running outside a request) translate nothing and are fine falling
 * back to the untranslated, hardcoded English message.
 */
export const LocaleContextStorage = {
  run<T>(locale: string, callback: () => T): T {
    return storage.run(locale, callback);
  },

  getLocale(): string {
    return storage.getStore() ?? FALLBACK_LOCALE;
  },
};
