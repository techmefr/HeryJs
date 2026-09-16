import type { HeryConfig } from './src/technical/config/hery-config.types';

export default {
  search: {
    default: 'prisma',
    engines: {
      prisma: { driver: 'prisma' },
    },
  },
  prune: {
    default: { retentionDays: 30 },
  },
  cache: {
    defaultTtlSeconds: 300,
  },
  i18n: {
    supportedLocales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  // One variable swings the whole app from logging mail to sending it, which
  // is the point of declaring the driver here rather than picking a class in
  // the module: MAIL_DRIVER=log in development, resend in production, no diff
  // between the two.
  mail: {
    default: process.env.MAIL_DRIVER ?? 'log',
    drivers: {
      log: { driver: 'log' },
    },
  },
  export: {
    default: 'csv',
    drivers: {
      csv: { driver: 'csv' },
    },
  },
} satisfies HeryConfig;
