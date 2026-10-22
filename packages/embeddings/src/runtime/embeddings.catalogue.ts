import { registerCatalogue } from '#kernel/i18n/catalogue';

export const EMBEDDINGS_CATALOGUE = registerCatalogue({
  'embeddings.request-failed': {
    fr: (details) =>
      `Le fournisseur d'embeddings n'a pas pu traiter le texte : ${String(details.reason)}`,
  },
});
