import { registerCatalogue } from '@heryjs/core/i18n';

export const TWO_FACTOR_CATALOGUE = registerCatalogue({
  'two-factor.code.invalid': {
    fr: "Ce code n'est pas valide.",
  },
  'two-factor.already-enrolled': {
    fr: "L'authentification à deux facteurs est déjà activée.",
  },
  'two-factor.enrolment-required': {
    fr: "Votre rôle exige l'authentification à deux facteurs : activez-la avant d'aller plus loin.",
  },
  'two-factor.locked': {
    fr: 'Trop de codes erronés. Réessayez plus tard.',
  },
  'two-factor.not-enrolled': {
    fr: "L'authentification à deux facteurs n'est pas configurée.",
  },
  'two-factor.required-by-role': {
    fr: "Votre rôle exige l'authentification à deux facteurs, elle ne peut donc pas être désactivée.",
  },
  'two-factor.required': {
    fr: "Cette session n'a pas encore validé son second facteur.",
  },
});
