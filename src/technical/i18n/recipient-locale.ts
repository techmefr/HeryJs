import { LocaleContextStorage } from './locale-context';
import { resolveDefaultLocale, resolveSupportedLocales } from './locale.config';

export function supportedLocale(
  locale: string | null | undefined,
): string | null {
  return locale && resolveSupportedLocales().includes(locale) ? locale : null;
}

/**
 * The language a message to someone is written in: theirs when they have one
 * the app still supports, the app's default otherwise. Deliberately not the
 * locale of whoever triggered the message -- a French admin resetting an
 * English user's password must not send them French.
 *
 * There is no per-tenant locale to fall back on yet, so the default is
 * `i18n.defaultLocale` from hery.config.ts.
 */
export function recipientLocale(
  recipient: { locale?: string | null } | null | undefined,
): string {
  return supportedLocale(recipient?.locale) ?? resolveDefaultLocale();
}

/**
 * Captured with work that outlives the request -- a queued job, an outbox
 * message -- and handed back to `runInLocale` when it is processed, where no
 * Accept-Language header exists any more.
 */
export function currentLocale(): string {
  return LocaleContextStorage.getLocale();
}

export function runInLocale<T>(
  locale: string | null | undefined,
  callback: () => T,
): T {
  return LocaleContextStorage.run(
    supportedLocale(locale) ?? resolveDefaultLocale(),
    callback,
  );
}
