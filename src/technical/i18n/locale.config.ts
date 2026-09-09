import { heryConfig } from '#technical/config/hery-config';

export const FALLBACK_LOCALE = 'en';

/**
 * Omitting `i18n` in `hery.config.ts` leaves the app English-only rather than
 * failing to resolve a locale: the catalogue is opt-in content, never a
 * required piece of wiring.
 */
export function resolveSupportedLocales(): string[] {
  return heryConfig.i18n?.supportedLocales ?? [FALLBACK_LOCALE];
}

export function resolveDefaultLocale(): string {
  return heryConfig.i18n?.defaultLocale ?? FALLBACK_LOCALE;
}
