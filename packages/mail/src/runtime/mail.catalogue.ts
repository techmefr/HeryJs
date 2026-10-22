import { registerCatalogue } from '#kernel/i18n/catalogue';

export const MAIL_CATALOGUE = registerCatalogue({
  'mail.template.welcome.subject': {
    en: 'Welcome to {{app}}',
    fr: 'Bienvenue sur {{app}}',
  },
  'mail.template.welcome.html': {
    en: '<p>Hi {{name}}, welcome to {{app}}.</p>',
    fr: '<p>Bonjour {{name}}, bienvenue sur {{app}}.</p>',
  },
  'admin.group.Messaging': { fr: 'Messagerie' },
  'admin.mail-drivers.title': { fr: "Pilotes d'e-mail" },
  'admin.mail-drivers.column.driver': { fr: 'Pilote' },
  'admin.mail-drivers.column.active': { fr: 'Actif' },
  'admin.mail-sends.title': { fr: 'Envois récents' },
  'admin.mail-sends.column.to': { fr: 'À' },
  'admin.mail-sends.column.subject': { fr: 'Objet' },
  'admin.mail-sends.column.status': { fr: 'Statut' },
  'admin.mail-sends.column.error': { fr: 'Erreur' },
  'admin.mail-sends.column.createdAt': { fr: 'Mis en file le' },
  'admin.mail-sends.column.sentAt': { fr: 'Envoyé le' },
  'admin.mail-send-test.title': { fr: 'Envoyer un e-mail de test' },
  'admin.mail-send-test.field.to': { fr: 'Envoyer à' },
});
