import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'storage',
  description:
    'Add file storage behind a swappable driver: local disk with signed local URLs by default -- set STORAGE_DRIVER=s3 to store in S3 or any S3-compatible server.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  install(context) {
    context.copyPackageFile('docker-compose.storage.yml');
    context.copyRuntime();

    context.nextSteps([
      `Inject "StorageService" anywhere and call ".upload()"/".signedUrl()"/".remove()"`,
      "Declare the driver in hery.config.ts, e.g. { storage: { default: process.env.STORAGE_DRIVER ?? 'local', drivers: { local: { driver: 'local' } } } }",
      'For the S3 driver: run "docker compose -f docker-compose.storage.yml up -d" (MinIO console on the mapped 9001 port), create the bucket, and set STORAGE_DRIVER=s3 + STORAGE_S3_* env vars -- no other wiring',
      'Browse, upload and delete files from the admin panel (install admin-astro): storage adds a Storage page',
    ]);
  },
} satisfies ModuleDefinition;
