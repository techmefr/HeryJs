import type { Catalogue } from '../catalogue.types';

export const QUERY_MESSAGES: Catalogue = {
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
  'query.invalid.soft-deletes': {
    fr: (details) =>
      `"${String(details.param)}" n'est pas accepté : cette ressource déclare "softDeletes: false", une suppression efface donc l'enregistrement définitivement et il n'y a pas de corbeille à lire.`,
  },
  'query.invalid.similar-not-offered': {
    fr: '"search.mode" ne peut pas valoir "similar" : cette ressource ne déclare aucun champ vectoriel, il n\'y a donc aucun embedding à comparer.',
  },
  'query.invalid.similar-rejected': {
    fr: (details) =>
      `"${String(details.param)}" n'est pas accepté avec "search.mode": "similar".`,
  },
};
