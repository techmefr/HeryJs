import type { HeryConfig } from './src/technical/config/hery-config.types';

export default {
  modules: [
    '@heryjs/export',
    '@heryjs/impersonation',
    '@heryjs/mail',
    '@heryjs/oauth',
    '@heryjs/sse',
    '@heryjs/sso',
    '@heryjs/scim',
    '@heryjs/storage',
    '@heryjs/webhooks',
  ],
  search: {
    default: 'prisma',
    engines: {
      prisma: { driver: 'prisma' },
    },
  },
  prune: {
    default: { retentionDays: 30 },
    overrides: {
      IdempotencyKey: { retentionDays: 1 },
    },
  },
  cache: {
    defaultTtlSeconds: 300,
  },
  i18n: {
    supportedLocales: ['en', 'fr'],
    defaultLocale: 'en',
    fallbacks: { fr: ['en'] },
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
  // Both drivers ship inside the storage module, so declaring s3 needs no
  // package and no wiring: STORAGE_DRIVER=s3 plus the STORAGE_S3_* variables is
  // the whole switch. The variable is read here as well as by the module's own
  // env, because that one decides whether the local serve route is mounted.
  storage: {
    default: process.env.STORAGE_DRIVER ?? 'local',
    drivers: {
      local: { driver: 'local' },
      s3: { driver: 's3' },
    },
  },
  sharing: {
    onGrantorErasure: 'revoke',
  },
  admin: {
    studioAccess: 'operator',
  },
  // The NODE_ENV values that open the devtools routes and the seeders and
  // accept the development secrets. Anything else, an unset NODE_ENV included,
  // runs as production. A demo may be listed: its seeders then stay behind an
  // admin or the platform operator.
  devTools: {
    environments: ['development', 'test'],
  },
  logging: {
    default: 'stdout',
    drivers: {
      stdout: { driver: 'stdout' },
    },
  },
  export: {
    default: 'csv',
    drivers: {
      csv: { driver: 'csv' },
    },
  },
} satisfies HeryConfig;
