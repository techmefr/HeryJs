type TranslationTemplate =
  string | ((details: Record<string, unknown>) => string);

export type Catalogue = Record<string, Record<string, TranslationTemplate>>;

/**
 * Keyed by `translationKey`, not by the `key` the response envelope carries:
 * `key` is the stable identifier a client matches on and several exceptions
 * share the same literal `key` while meaning different things (three
 * `query.invalid` subclasses) or build `key` dynamically per resource
 * (`RecordNotFoundException`). `translationKey` exists so this catalogue can
 * have one finite entry per distinct message without touching either.
 *
 * `capability.forbidden` has no entry on purpose: a security message that
 * varies by locale is a signal about itself, so it always stays in English.
 * Free-text exceptions (a rejected upload's reason, for example) have no
 * entry either -- there is no canonical string to translate.
 */
export const CATALOGUE: Catalogue = {
  'internal.error': {
    fr: 'Erreur interne du serveur.',
  },
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
  'rate-limit.exceeded': {
    fr: 'Trop de requêtes.',
  },
  'rate-limit.unavailable': {
    fr: 'Impossible de vérifier la limite de requêtes pour cette requête.',
  },
  'record.notFound': {
    fr: (details) => `${String(details.resource)} introuvable.`,
  },
  'record.alreadyRestored': {
    fr: (details) =>
      `${String(details.resource)} n'est pas dans la corbeille, il ne peut donc pas être restauré.`,
  },
  'query.invalid.param': {
    fr: (details) =>
      `Valeur invalide pour "${String(details.param)}". Autorisées : ${(details.allowed as unknown[]).join(', ')}.`,
  },
  'query.invalid.value': {
    fr: "Une des valeurs de cette requête ne correspond pas au type du champ sur lequel elle est utilisée. Vérifiez chaque valeur de filtre, d'agrégat et de mutation par rapport aux types indiqués par le point de terminaison describe.",
  },
  'query.invalid.pagination': {
    fr: (details) =>
      `"${String(details.param)}" n'est pas accepté : cette ressource ne déclare aucune pagination, sa route de recherche renvoie donc toutes les correspondances. Son point de terminaison describe indique "paginated": false.`,
  },
};
