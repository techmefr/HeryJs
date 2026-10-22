import type { Catalogue } from '../catalogue.types';

export const AUTH_MESSAGES: Catalogue = {
  'team.noCurrentTeam': {
    fr: 'Rejoignez une équipe avant de créer des enregistrements qui lui appartiennent.',
  },
  'auth.session.missing': {
    fr: 'Jeton de session manquant.',
  },
  'auth.session.invalid': {
    fr: 'Session invalide ou expirée.',
  },
  'auth.invalidCredentials': {
    fr: 'Identifiants invalides.',
  },
  'auth.accountLocked': {
    fr: 'Trop de tentatives de connexion échouées. Réessayez plus tard.',
  },
  'auth.currentPasswordInvalid': {
    fr: 'Le mot de passe actuel est incorrect.',
  },
  'apiKey.sessionsForbidden': {
    fr: 'Une clé API ne peut pas gérer les sessions ni les mots de passe.',
  },
  'apiKey.forbidden': {
    fr: 'Une clé API ne peut pas gérer les clés API.',
  },
  'impersonation.notImpersonating': {
    fr: "Vous n'usurpez l'identité de personne.",
  },
  'impersonation.self': {
    fr: 'Vous ne pouvez pas usurper votre propre identité.',
  },
  'exposition.environmentBlocked': {
    fr: (details) =>
      `« ${String(details.action)} » n'est pas exposé dans cet environnement.`,
  },
  'admin.twoFactorRequired': {
    en: 'Turn on two-factor authentication on your account before opening the admin studio.',
    fr: "Activez l'authentification à deux facteurs sur votre compte avant d'ouvrir le studio d'administration.",
  },
  'privacy.tenantErasureNotConfirmed': {
    fr: "L'effacement d'un tenant exige que « confirm » nomme le tenant effacé.",
  },
};
