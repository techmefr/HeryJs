import { currentLocale, runInLocale } from '#technical/i18n/recipient-locale';

export const JOB_LOCALE_KEY = 'heryLocale';

export function withJobLocale(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { [JOB_LOCALE_KEY]: currentLocale(), ...data };
}

/**
 * A worker has no request, so without this every job ran in English whatever
 * the language of the request that queued it -- an export's headers, a
 * notification's text, an error message recorded on a failed step.
 */
export function runInJobLocale<T>(data: unknown, callback: () => T): T {
  const locale =
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Record<string, unknown>)[JOB_LOCALE_KEY] === 'string'
      ? ((data as Record<string, unknown>)[JOB_LOCALE_KEY] as string)
      : null;

  return runInLocale(locale, callback);
}
