import type { Catalogue } from '../catalogue.types';

function boundOf(
  details: Record<string, unknown>,
  bound: 'minimum' | 'maximum',
): string {
  const value = String(details[bound]);

  switch (details.origin) {
    case 'string':
      return `${value} caractère(s)`;
    case 'array':
    case 'set':
      return `${value} élément(s)`;
    case 'file':
      return `${value} octet(s)`;
    default:
      return value;
  }
}

export const VALIDATION_MESSAGES: Catalogue = {
  'validation.failed': {
    en: 'The request is invalid. Each issue is listed in details.issues.',
    fr: 'La requête est invalide. Chaque problème est détaillé dans details.issues.',
  },
  'validation.issue.invalid_type': {
    fr: (details) => `Type invalide : ${String(details.expected)} attendu.`,
  },
  'validation.issue.too_small': {
    fr: (details) =>
      `Trop petit : ${details.inclusive === false ? 'plus de' : 'au moins'} ${boundOf(details, 'minimum')} attendu(s).`,
  },
  'validation.issue.too_big': {
    fr: (details) =>
      `Trop grand : ${details.inclusive === false ? 'moins de' : 'au plus'} ${boundOf(details, 'maximum')} attendu(s).`,
  },
  'validation.issue.invalid_format': {
    fr: (details) => `Format invalide : ${String(details.format)} attendu.`,
  },
  'validation.issue.not_multiple_of': {
    fr: (details) =>
      `Nombre invalide : multiple de ${String(details.divisor)} attendu.`,
  },
  'validation.issue.unrecognized_keys': {
    fr: (details) =>
      `Clé(s) non reconnue(s) : ${(details.keys as unknown[]).map((key) => `"${String(key)}"`).join(', ')}.`,
  },
  'validation.issue.invalid_union': {
    fr: 'La valeur ne correspond à aucune des formes acceptées.',
  },
  'validation.issue.invalid_key': {
    fr: 'Clé invalide.',
  },
  'validation.issue.invalid_element': {
    fr: 'Élément invalide.',
  },
  'validation.issue.invalid_value': {
    fr: (details) =>
      `Valeur invalide : une de ${(details.values as unknown[]).map((value) => JSON.stringify(value)).join(', ')} attendue.`,
  },
};
