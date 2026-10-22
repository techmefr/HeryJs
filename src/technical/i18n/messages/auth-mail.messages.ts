import type { Catalogue } from '../catalogue.types';

export const AUTH_MAIL_MESSAGES: Catalogue = {
  'mail.verifyEmail.subject': {
    en: 'Verify your email address',
    fr: 'Vérifiez votre adresse e-mail',
  },
  'mail.verifyEmail.body': {
    en: 'Confirm this address to finish setting up your account.',
    fr: 'Confirmez cette adresse pour terminer la création de votre compte.',
  },
  'mail.verifyEmail.action': {
    en: 'Verify my email',
    fr: 'Vérifier mon adresse e-mail',
  },
  'mail.resetPassword.subject': {
    en: 'Reset your password',
    fr: 'Réinitialisez votre mot de passe',
  },
  'mail.resetPassword.body': {
    en: 'Someone asked to reset the password for this account. If that was not you, ignore this message.',
    fr: "Quelqu'un a demandé à réinitialiser le mot de passe de ce compte. Si ce n'était pas vous, ignorez ce message.",
  },
  'mail.resetPassword.action': {
    en: 'Choose a new password',
    fr: 'Choisir un nouveau mot de passe',
  },
  'mail.magicLink.subject': {
    en: 'Your sign-in link',
    fr: 'Votre lien de connexion',
  },
  'mail.magicLink.body': {
    en: 'Use this link to sign in. It works once and expires soon. If you did not ask for it, ignore this message.',
    fr: "Utilisez ce lien pour vous connecter. Il ne sert qu'une fois et expire bientôt. Si vous ne l'avez pas demandé, ignorez ce message.",
  },
  'mail.magicLink.action': {
    en: 'Sign in',
    fr: 'Se connecter',
  },
  'mail.otp.subject.sign-in': {
    en: 'Your sign-in code',
    fr: 'Votre code de connexion',
  },
  'mail.otp.subject.email-verification': {
    en: 'Your email verification code',
    fr: 'Votre code de vérification d’adresse e-mail',
  },
  'mail.otp.subject.forget-password': {
    en: 'Your password reset code',
    fr: 'Votre code de réinitialisation du mot de passe',
  },
  'mail.otp.subject.change-email': {
    en: 'Your email change code',
    fr: 'Votre code de changement d’adresse e-mail',
  },
  'mail.otp.body': {
    en: (details) =>
      `Your code is <strong>${String(details.code)}</strong>. It expires soon. If you did not ask for it, ignore this message.`,
    fr: (details) =>
      `Votre code est <strong>${String(details.code)}</strong>. Il expire bientôt. Si vous ne l'avez pas demandé, ignorez ce message.`,
  },
  'sms.otp.body': {
    en: (details) =>
      `Your verification code is ${String(details.code)}. If you did not ask for it, ignore this message.`,
    fr: (details) =>
      `Votre code de vérification est ${String(details.code)}. Si vous ne l'avez pas demandé, ignorez ce message.`,
  },
};
