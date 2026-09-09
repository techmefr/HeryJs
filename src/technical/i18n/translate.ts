import type { DomainException } from '#technical/errors/domain.exception';
import { CATALOGUE } from './catalogue';
import { LocaleContextStorage } from './locale-context';
import { FALLBACK_LOCALE } from './locale.config';

export function translate(
  translationKey: string,
  details: unknown,
  fallbackMessage: string,
): string {
  const locale = LocaleContextStorage.getLocale();

  if (locale === FALLBACK_LOCALE) {
    return fallbackMessage;
  }

  const template = CATALOGUE[translationKey]?.[locale];

  if (!template) {
    return fallbackMessage;
  }

  return typeof template === 'function'
    ? template((details ?? {}) as Record<string, unknown>)
    : template;
}

export function translateDomainException(exception: DomainException): string {
  return translate(
    exception.translationKey,
    exception.details,
    exception.message,
  );
}
