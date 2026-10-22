import { registerCatalogue } from '#kernel/i18n/catalogue';

export const BILLING_CATALOGUE = registerCatalogue({
  'billing.invalidSignature': {
    fr: 'Refusé.',
  },
  'billing.quota.exceeded': {
    fr: (details) =>
      `L'offre de ce tenant autorise au plus ${String(details.limit)} pour « ${String(details.feature)} ».`,
  },
});
