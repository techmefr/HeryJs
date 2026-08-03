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
} satisfies HeryConfig;
