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
} satisfies HeryConfig;
