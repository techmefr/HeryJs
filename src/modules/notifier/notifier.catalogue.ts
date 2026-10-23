import { registerCatalogue } from '#technical/public/i18n';

export const NOTIFIER_CATALOGUE = registerCatalogue({
  'notifications.digest.subject.one': {
    en: 'You have 1 new notification',
    fr: 'Vous avez 1 nouvelle notification',
  },
  'notifications.digest.subject.other': {
    en: (details) => `You have ${String(details.count)} new notifications`,
    fr: (details) =>
      `Vous avez ${String(details.count)} nouvelles notifications`,
  },
  'notifications.digest.intro': {
    en: 'Here is what you missed:',
    fr: 'Voici ce que vous avez manqué :',
  },
});
