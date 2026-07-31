import type { HeryConfig } from './src/technical/config/hery-config.types';

export default {
  search: {
    default: 'prisma',
    engines: {
      prisma: { driver: 'prisma' },
    },
  },
} satisfies HeryConfig;
