import type { Catalogue } from '../catalogue.types';

function currentVersionOf(details: Record<string, unknown>): string {
  return typeof details.current === 'number'
    ? String(details.current)
    : 'inconnue';
}

export const RECORD_MESSAGES: Catalogue = {
  'record.notFound': {
    fr: (details) => `${String(details.resource)} introuvable.`,
  },
  'record.alreadyRestored': {
    fr: (details) =>
      `${String(details.resource)} n'est pas dans la corbeille, il ne peut donc pas être restauré.`,
  },
  'record.historyEntryNotFound': {
    fr: (details) =>
      `${String(details.resource)} n'a pas d'entrée d'historique ${String(details.entryId)}.`,
  },
  'record.versionConflict': {
    fr: (details) =>
      `${String(details.resource)} a été modifié depuis votre lecture (version envoyée ${String(details.expected)}, version actuelle ${currentVersionOf(details)}). Rechargez-le puis réappliquez votre modification.`,
  },
  'record.preconditionFailed': {
    fr: (details) =>
      `${String(details.resource)} a été modifié depuis votre lecture (If-Match ${String(details.expected)}, version actuelle ${currentVersionOf(details)}). Rechargez-le puis réappliquez votre modification.`,
  },
  'record.versionRequired': {
    fr: (details) =>
      `${String(details.resource)} est versionné : envoyez la version lue, dans le champ "version" de l'entrée ou dans un en-tête If-Match.`,
  },
  'record.ifMatchSingleEntry': {
    fr: 'If-Match ne s\'applique qu\'à une requête portant exactement une entrée ; envoyez plutôt la "version" de chaque entrée dans le corps.',
  },
  'record.ifMatchMalformed': {
    fr: 'If-Match doit porter la version lue, entre guillemets : "3".',
  },
  'workflow.illegalTransition': {
    fr: (details) =>
      `${String(details.resource)} ne peut pas « ${String(details.transition)} » depuis « ${String(details.current)} ».`,
  },
  'workflow.guardFailed': {
    fr: (details) =>
      `${String(details.resource)} ne peut pas « ${String(details.transition)} » tant que ${(details.missing as unknown[]).join(', ')} n'est pas renseigné.`,
  },
  'slug.taken': {
    fr: (details) =>
      `"${String(details.slug)}" est déjà utilisé comme ${String(details.field)} dans ce tenant.`,
  },
  'translatable.empty': {
    fr: (details) =>
      `"${String(details.field)}" est obligatoire et resterait sans aucune traduction.`,
  },
  'batch.atomicFailed': {
    fr: (details) => {
      const failed = Number(
        (details.summary as { failed?: unknown } | undefined)?.failed,
      );

      return `Le lot était atomique et ${failed} ${failed === 1 ? 'entrée a échoué' : 'entrées ont échoué'}, rien n'a donc été écrit. Chaque entrée est détaillée dans details.results.`;
    },
  },
  'idempotency.mismatch': {
    fr: (details) =>
      `La clé Idempotency-Key "${String(details.key)}" a déjà servi pour une autre requête. Réutiliser une clé pour deux requêtes différentes est une erreur du client : envoyez une nouvelle clé pour une nouvelle requête.`,
  },
  'idempotency.lock-timeout': {
    fr: (details) =>
      `Impossible d'obtenir à temps l'accès exclusif à la clé Idempotency-Key "${String(details.key)}". Une autre requête avec la même clé est encore en cours : réessayez dans un instant.`,
  },
};
