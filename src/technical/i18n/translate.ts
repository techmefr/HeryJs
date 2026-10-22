import type { DomainException } from '#technical/errors/domain.exception';
import { CATALOGUE } from './catalogue';
import { LocaleContextStorage } from './locale-context';

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

export function translateDomainException(exception: DomainException): string {
  return translate(
    exception.translationKey,
    exception.details,
    exception.message,
  );
}
