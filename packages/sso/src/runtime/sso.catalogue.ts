import { registerCatalogue } from '#kernel/public/i18n';
import type { SsoConflictReason } from './sso-connection-conflict.exception';
import type { SsoRefusalReason } from './sso-refused.exception';

const REFUSED_FR: Record<SsoRefusalReason, string> = {
  'no-connection': 'aucune connexion SSO ne correspond',
  'connection-disabled': 'la connexion SSO est désactivée',
  'invalid-state':
    'la réponse du fournisseur ne correspond à aucune demande en cours',
  'access-denied': "l'accès a été refusé chez le fournisseur",
  'provider-failure': 'le fournisseur a échoué',
  'email-missing': "le fournisseur n'a transmis aucune adresse e-mail",
  'email-unverified': "le fournisseur n'a pas vérifié l'adresse e-mail",
  'email-domain-not-verified':
    "le domaine de l'adresse e-mail n'est pas vérifié",
  'account-exists': 'un compte existe déjà avec cette adresse e-mail',
  'identity-linked-elsewhere': 'cette identité est déjà liée à un autre compte',
  'user-banned': 'ce compte est suspendu',
  'untrusted-issuer': "l'émetteur n'est pas reconnu",
  'invalid-assertion': "l'assertion est invalide",
};

const CONFLICT_FR: Record<SsoConflictReason, string> = {
  'connection-limit': 'la limite de connexions SSO est atteinte',
  'domain-claimed': 'ce domaine est déjà revendiqué',
  'domain-unknown': 'ce domaine est inconnu',
  'domain-invalid': "ce domaine n'est pas valide",
  'domain-verification-failed': 'la vérification du domaine a échoué',
  'protocol-mismatch': 'le protocole ne correspond pas à celui de la connexion',
  'saml-certificate-invalid': "le certificat SAML n'est pas valide",
  'saml-entry-point-insecure': "le point d'entrée SAML n'est pas en https",
  'saml-metadata-invalid': 'les métadonnées SAML sont invalides',
  'saml-incomplete': 'la configuration SAML est incomplète',
};

export const SSO_CATALOGUE = registerCatalogue({
  'sso.refused': {
    fr: (details) =>
      `Authentification unique refusée : ${REFUSED_FR[details.reason as SsoRefusalReason]}.`,
  },
  'sso.connectionConflict': {
    fr: (details) =>
      `Configuration SSO refusée : ${CONFLICT_FR[details.reason as SsoConflictReason]}.`,
  },
  'sso.connectionNotFound': {
    fr: 'Connexion SSO introuvable.',
  },
});
