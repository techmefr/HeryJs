import type { DomainException } from '#technical/errors/domain.exception';
import { CATALOGUE } from './catalogue';
import { LocaleContextStorage } from './locale-context';
import { FALLBACK_LOCALE, resolveLocaleFallbacks } from './locale.config';

export function translate(
  translationKey: string,
  details: unknown,
  fallbackMessage: string,
): string {
  return translateIn(
    LocaleContextStorage.getLocale(),
    translationKey,
    details,
    fallbackMessage,
  );
}

export function translateIn(
  locale: string,
  translationKey: string,
  details: unknown,
  fallbackMessage: string,
): string {
  const template = CATALOGUE[translationKey]?.[locale];

  if (!template) {
    return fallbackMessage;
  }

  return typeof template === 'function'
    ? template((details ?? {}) as Record<string, unknown>)
    : template;
}

/**
 * For text that has no English original of its own -- a mail subject, an SMS
 * body, an admin label -- so its `en` entry is the last resort, after the
 * locale's declared fallbacks. A key with no entry at all comes back as is,
 * which keeps a plain label written without a catalogue entry readable.
 */
export function translateMessage(
  key: string,
  details: Record<string, unknown> = {},
  locale: string = LocaleContextStorage.getLocale(),
): string {
  const entry = CATALOGUE[key];

  if (!entry) {
    return key;
  }

  const chain = [
    locale,
    ...(resolveLocaleFallbacks()[locale] ?? []),
    FALLBACK_LOCALE,
  ];
  const template = chain
    .map((candidate) => entry[candidate])
    .find((candidate) => candidate !== undefined);

  if (template === undefined) {
    return key;
  }

  return typeof template === 'function' ? template(details) : template;
}

export function translateDomainException(exception: DomainException): string {
  return translate(
    exception.translationKey,
    exception.details,
    exception.message,
  );
}
