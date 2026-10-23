import { registerCatalogue } from '@heryjs/core/i18n';
import type { WebhookNotFoundSubject } from './webhook-not-found.exception';
import type { WebhookRefusedReason } from './webhook-refused.exception';

const REFUSED_FR: Record<WebhookRefusedReason, string> = {
  'url-refused': "L'URL doit être une adresse https publique.",
  'subscription-limit': "Ce tenant a atteint sa limite d'abonnements.",
  'delivery-not-dead': 'Seule une livraison morte peut être relivrée.',
};

const NOT_FOUND_FR: Record<WebhookNotFoundSubject, string> = {
  subscription: 'Abonnement webhook introuvable.',
  delivery: 'Livraison webhook introuvable.',
};

export const WEBHOOKS_CATALOGUE = registerCatalogue({
  'webhook.invalidSignature': {
    fr: 'Refusé.',
  },
  'webhook.refused': {
    fr: (details) => REFUSED_FR[details.reason as WebhookRefusedReason],
  },
  'webhook.notFound': {
    fr: (details) => NOT_FOUND_FR[details.subject as WebhookNotFoundSubject],
  },
  'webhook.actionNotExposed': {
    fr: (details) =>
      `« ${String(details.action)} » n'est pas une action exposée aux webhooks.`,
  },
  'webhook.bodyInvalid': {
    fr: 'Le corps du webhook doit être un JSON valide.',
  },
});
