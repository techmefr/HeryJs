import { registerCatalogue } from '#kernel/i18n/catalogue';

export const STORAGE_CATALOGUE = registerCatalogue({
  'storage.key.invalid': {
    fr: 'Une clé de stockage doit rester dans la racine du stockage.',
  },
  'storage.body.too_large': {
    fr: (details) =>
      `Un fichier stocké ne doit pas dépasser ${String(details.maxBytes)} octets.`,
  },
  'storage.key.not_found': {
    fr: "Aucun fichier avec cette clé n'existe pour ce tenant.",
  },
  'storage.presign.unsupported': {
    fr: (details) =>
      `Le pilote de stockage « ${String(details.driverName)} » n'a pas d'équivalent d'envoi présigné, utilisez POST /storage/upload en développement local.`,
  },
  'storage.upload_intent.not_found': {
    fr: "Aucune intention d'envoi en attente ne correspond à cette clé, elle a peut-être expiré ou déjà été confirmée.",
  },
});
