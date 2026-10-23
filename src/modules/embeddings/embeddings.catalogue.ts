import { registerCatalogue } from '@heryjs/core/i18n';

export const EMBEDDINGS_CATALOGUE = registerCatalogue({
  'embeddings.request-failed': {
    fr: (details) =>
      `Le fournisseur d'embeddings n'a pas pu traiter le texte : ${String(details.reason)}`,
  },
});
