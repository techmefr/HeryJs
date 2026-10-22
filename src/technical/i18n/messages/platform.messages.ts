import type { Catalogue } from '../catalogue.types';

export const PLATFORM_MESSAGES: Catalogue = {
  'internal.error': {
    fr: 'Erreur interne du serveur.',
  },
  'rate-limit.exceeded': {
    fr: 'Trop de requêtes.',
  },
  'rate-limit.unavailable': {
    fr: 'Impossible de vérifier la limite de requêtes pour cette requête.',
  },
  'quota.exceeded': {
    fr: (details) =>
      `Ce tenant a utilisé ${String(details.used)} des ${String(details.limit)} autorisés pour « ${String(details.name)} ».`,
  },
  'quota.notDeclared': {
    fr: (details) =>
      `Aucun quota nommé « ${String(details.name)} » n'est déclaré dans hery.config.ts.`,
  },
  'audit.sink.refused': {
    fr: (details) =>
      `Cette destination d'audit est refusée : ${String(details.reason)}`,
  },
  'secrets.decryptionFailed': {
    fr: "Un secret stocké n'a pas pu être déchiffré.",
  },
  'secrets.misconfigured': {
    fr: (details) =>
      `Les secrets ne sont pas configurés correctement : ${String(details.reason)}`,
  },
  'secrets.encryptedFieldQuery': {
    fr: (details) =>
      `${String(details.model)}.${String(details.column)} est chiffré et ne peut pas servir à ${String(details.use)} : comparer des chiffrés ne revient pas à comparer les secrets.`,
  },
  'secrets.encryptedNestedWrite': {
    fr: (details) =>
      `${String(details.model)}.${String(details.relation)} écrit dans ${String(details.target)}, qui a des colonnes chiffrées. Une écriture imbriquée contourne le chiffrement : écrivez ${String(details.target)} directement.`,
  },
  'cache.ttl.invalid': {
    fr: (details) =>
      `Une durée de cache doit être un nombre entier positif de secondes, reçu ${String(details.ttlSeconds)}.`,
  },
  'embeddings.dimension-mismatch': {
    fr: (details) =>
      `Le pilote d'embeddings a renvoyé ${String(details.received)} dimensions mais la colonne vectorielle en déclare ${String(details.expected)}. Alignez les dimensions du blueprint sur le modèle appelé par le pilote.`,
  },
  'health.check.duplicate': {
    fr: (details) =>
      `Une vérification de santé nommée « ${String(details.name)} » est déjà enregistrée.`,
  },
  'http.request-failed': {
    fr: (details) =>
      `${String(details.method)} ${String(details.url)} a répondu ${String(details.status)}.`,
  },
  'http.request-timeout': {
    fr: (details) =>
      `${String(details.method)} ${String(details.url)} n'a pas répondu en ${String(details.timeoutMs)} ms.`,
  },
  'http.unstubbed-request': {
    fr: (details) => {
      const stubbed = details.stubbed as unknown[];

      return `Aucun bouchon ne correspond à ${String(details.method)} ${String(details.url)}. Le pilote HTTP factice refuse d'atteindre le réseau : bouchonnez d'abord avec fake.stub("${String(details.url)}", { status: 200, body: {} }). Bouchons actuels : ${stubbed.length > 0 ? stubbed.join(', ') : 'aucun'}.`;
    },
  },
  'http.circuit-open': {
    fr: (details) =>
      `Les appels vers ${String(details.host)} sont suspendus après des échecs répétés. Réessayez dans ${Math.ceil(Number(details.retryAfterMs) / 1000)} s.`,
  },
  'http.bulkhead-full': {
    fr: (details) =>
      `${String(details.maxConcurrent)} appels vers ${String(details.host)} sont déjà en cours.`,
  },
  'jobFlow.empty': {
    fr: (details) =>
      `Le flux « ${String(details.flow)} » n'a aucune étape à exécuter.`,
  },
  'jobFlow.definitionNotFound': {
    fr: (details) =>
      `Aucun flux n'est défini sous le nom « ${String(details.name)} ».`,
  },
  'jobFlow.nothingToRetry': {
    fr: "Ce flux n'a aucune étape en échec à relancer.",
  },
  'jobFlow.stepRunning': {
    fr: 'Une étape de ce flux est en cours. Annulez-le une fois cette étape terminée.',
  },
  'jobFlow.handler.duplicate': {
    fr: (details) =>
      `Un gestionnaire d'étape est déjà enregistré pour « ${String(details.name)} ».`,
  },
  'jobFlow.handler.missing': {
    fr: (details) =>
      `Aucun gestionnaire d'étape n'est enregistré pour « ${String(details.name)} ». Enregistrez-le avec JobFlowHandlers, puis relancez le flux.`,
  },
  'jobFlow.alreadyFinished': {
    fr: "Ce flux est déjà terminé ou a été annulé, il n'y a donc plus rien à annuler.",
  },
  'log.query-unavailable': {
    fr: "Aucun pilote de journalisation qui conserve ce qu'il reçoit n'est déclaré, il n'y a donc rien à interroger. Déclarez le pilote \"database\" sous logging.drivers dans hery.config.ts.",
  },
  'featureFlag.notFound': {
    fr: (details) =>
      `Aucun feature flag « ${String(details.key)} » n'est défini à cette portée.`,
  },
  'backup.notFound': {
    fr: (details) =>
      `Il n'existe aucune sauvegarde nommée ${String(details.name)}.`,
  },
  'backup.confirmationMismatch': {
    fr: "La confirmation ne correspond pas au nom de la sauvegarde ; rien n'a été restauré.",
  },
};
