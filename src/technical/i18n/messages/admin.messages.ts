import type { Catalogue } from '../catalogue.types';

function section(
  id: string,
  title: string,
  columns: Record<string, string>,
): Catalogue {
  return {
    [`admin.${id}.title`]: { fr: title },
    ...Object.fromEntries(
      Object.entries(columns).map(([key, label]) => [
        `admin.${id}.column.${key}`,
        { fr: label },
      ]),
    ),
  };
}

function action(
  id: string,
  title: string,
  confirm?: string,
  fields: Record<string, string> = {},
): Catalogue {
  return {
    [`admin.${id}.title`]: { fr: title },
    ...(confirm ? { [`admin.${id}.confirm`]: { fr: confirm } } : {}),
    ...Object.fromEntries(
      Object.entries(fields).map(([name, label]) => [
        `admin.${id}.field.${name}`,
        { fr: label },
      ]),
    ),
  };
}

/**
 * Keyed by the section or action id the decorator already declares, so a
 * decorator keeps its English text as written and only gains a translation
 * here -- see `adminText`.
 */
export const ADMIN_MESSAGES: Catalogue = {
  'admin.group.Operations': { fr: 'Exploitation' },
  'admin.group.Users and access': { fr: 'Utilisateurs et accès' },
  'admin.group.Performance': { fr: 'Performance' },
  'admin.group.Compliance': { fr: 'Conformité' },
  ...section('studio-health', 'Santé', {
    name: 'Vérification',
    probe: 'Sonde',
    status: 'Statut',
    durationMs: 'Durée (ms)',
    message: 'Message',
  }),
  ...section('studio-scheduler', 'Tâches planifiées', {
    name: 'Tâche',
    status: 'Dernière exécution',
    lastRunAt: 'Le',
    durationMs: 'Durée (ms)',
    errorMessage: 'Erreur',
  }),
  ...section('studio-environment', 'Environnement', {
    setting: 'Paramètre',
    value: 'Valeur',
  }),
  ...section('studio-users', 'Utilisateurs', {
    email: 'E-mail',
    name: 'Nom',
    role: 'Rôle',
    emailVerified: 'Vérifié',
    twoFactorEnabled: '2FA',
    banned: 'Suspendu',
    activeSessions: 'Sessions',
    activeApiKeys: 'Clés API',
    createdAt: 'Inscrit le',
  }),
  ...action(
    'studio-user-sign-out',
    'Déconnecter partout',
    'Toutes les sessions de cet utilisateur prennent fin maintenant ; ses clés API continuent de fonctionner.',
  ),
  ...section('studio-sessions', 'Sessions', {
    userEmail: 'Utilisateur',
    ipAddress: 'IP',
    userAgent: 'Agent',
    impersonated: 'Usurpée',
    createdAt: 'Ouverte le',
    expiresAt: 'Expire le',
    userId: 'Id utilisateur',
  }),
  ...action(
    'studio-session-revoke',
    'Révoquer la session',
    'Cette session est déconnectée maintenant.',
  ),
  ...section('studio-api-keys', 'Clés API', {
    name: 'Nom',
    userEmail: 'Propriétaire',
    createdAt: 'Créée le',
    revokedAt: 'Révoquée le',
    userId: 'Id propriétaire',
  }),
  ...action(
    'studio-api-key-revoke',
    'Révoquer la clé',
    'Tout appelant utilisant cette clé est refusé dès maintenant.',
  ),
  ...section('output-cache-routes', 'Cache de sortie', {
    route: 'Route',
    models: 'Invalidé par',
    ttlSeconds: 'TTL (s)',
    hits: 'Succès',
    misses: 'Échecs',
  }),
  ...action(
    'output-cache-flush',
    'Vider le cache de sortie',
    'Supprimer toutes les réponses en cache de ce tenant ?',
  ),
  ...action('privacy-export', 'Exporter les données', undefined, {
    userId: 'Id utilisateur (vide pour tout le tenant)',
  }),
  ...action(
    'privacy-erase-user',
    'Effacer un utilisateur',
    'Effacer cet utilisateur et ses données personnelles. Action irréversible.',
    { userId: 'Id utilisateur' },
  ),
  ...action(
    'privacy-erase-tenant',
    'Effacer le tenant',
    'Effacer les données personnelles de tout le tenant. Action irréversible.',
    { confirm: "Saisissez l'id du tenant pour confirmer" },
  ),
  ...section('privacy-requests', 'Demandes RGPD', {
    kind: 'Type',
    status: 'Statut',
    subjectId: 'Personne concernée',
    createdAt: 'Demandée le',
    completedAt: 'Terminée le',
    error: 'Erreur',
  }),
};
