import { ADMIN_MESSAGES } from './messages/admin.messages';
import { AUTH_MAIL_MESSAGES } from './messages/auth-mail.messages';
import { AUTH_MESSAGES } from './messages/auth.messages';
import { PLATFORM_MESSAGES } from './messages/platform.messages';
import { QUERY_MESSAGES } from './messages/query.messages';
import { RECORD_MESSAGES } from './messages/record.messages';
import { VALIDATION_MESSAGES } from './messages/validation.messages';
import type { Catalogue } from './catalogue.types';

export type { Catalogue, TranslationTemplate } from './catalogue.types';

/**
 * Keyed by `translationKey`, not by the `key` the response envelope carries:
 * `key` is the stable identifier a client matches on and several exceptions
 * share the same literal `key` while meaning different things (three
 * `query.invalid` subclasses) or build `key` dynamically per resource
 * (`RecordNotFoundException`). `translationKey` exists so this catalogue can
 * have one finite entry per distinct message without touching either.
 *
 * The English text stays the exception's own message, so an entry only needs
 * an `en` template when that message is not fit to be read as is.
 *
 * `capability.forbidden` has no entry on purpose: a security message that
 * varies by locale is a signal about itself, so it always stays in English.
 * Free-text exceptions (a rejected upload's reason, for example) have no
 * entry either -- there is no canonical string to translate.
 *
 * A module owns the messages of its own exceptions and adds them with
 * `registerCatalogue` when it is loaded, since the kernel cannot import a
 * module that may be uninstalled.
 */
export const CATALOGUE: Catalogue = {
  ...AUTH_MESSAGES,
  ...AUTH_MAIL_MESSAGES,
  ...ADMIN_MESSAGES,
  ...RECORD_MESSAGES,
  ...QUERY_MESSAGES,
  ...PLATFORM_MESSAGES,
  ...VALIDATION_MESSAGES,
};

export function registerCatalogue(entries: Catalogue): Catalogue {
  for (const [key, byLocale] of Object.entries(entries)) {
    CATALOGUE[key] = { ...CATALOGUE[key], ...byLocale };
  }

  return entries;
}
