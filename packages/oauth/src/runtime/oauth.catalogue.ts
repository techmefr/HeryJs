import { registerCatalogue } from '#kernel/public/i18n';
import type { OAuthRefusalReason } from './oauth-refused.exception';

const REFUSED_FR: Record<OAuthRefusalReason, string> = {
  'email-missing': "le fournisseur n'a transmis aucune adresse e-mail",
  'email-unverified': "le fournisseur n'a pas vérifié l'adresse e-mail",
  'account-exists': 'un compte existe déjà avec cette adresse e-mail',
  'identity-linked-elsewhere': 'cette identité est déjà liée à un autre compte',
  'sign-up-disabled': 'les inscriptions sont fermées',
  'user-banned': 'ce compte est suspendu',
  'linking-disabled': "la liaison d'un compte social est désactivée",
  'invalid-state':
    'la réponse du fournisseur ne correspond à aucune demande en cours',
  'unknown-provider': 'fournisseur inconnu',
  'access-denied': "l'accès a été refusé chez le fournisseur",
  'provider-failure': 'le fournisseur a échoué',
};

export const OAUTH_CATALOGUE = registerCatalogue({
  'oauth.refused': {
    fr: (details) =>
      `Connexion sociale refusée : ${REFUSED_FR[details.reason as OAuthRefusalReason]}.`,
  },
});
