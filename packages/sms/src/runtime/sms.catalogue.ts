import { registerCatalogue } from '@heryjs/core/i18n';
import type { SmsRefusalReason } from './sms.guard';

const REFUSED_FR: Record<
  SmsRefusalReason,
  (details: Record<string, unknown>) => string
> = {
  'not-e164': (details) =>
    `"${String(details.to)}" n'est pas un numéro E.164. Un numéro national ne désigne aucun pays, et chaque règle d'envoi dépend du pays.`,
  'alphanumeric-sender': () =>
    "Ce pays refuse un expéditeur alphanumérique : l'opérateur abandonne le message au lieu de renvoyer une erreur, il paraîtrait donc livré sans jamais arriver.",
  'no-consent': () =>
    "Aucun consentement n'est enregistré pour ce numéro. L'absence d'enregistrement vaut absence de consentement, pas autorisation.",
  'opt-out-missing': () =>
    'Un message marketing vers ce pays doit mentionner dans son corps le moyen de se désinscrire.',
  'outside-window': (details) =>
    `Le marketing vers ce pays est autorisé entre ${String(details.from)} h et ${String(details.until)} h, heure locale, et il y est ${String(details.localHour)} h.`,
};

export const SMS_CATALOGUE = registerCatalogue({
  'sms.refused': {
    fr: (details) => REFUSED_FR[details.reason as SmsRefusalReason](details),
  },
});
