import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';

export default defineModule({
  name: 'storage',
  description:
    'Add file storage behind a swappable provider: local disk (signed local URLs) by default, S3-compatible (real S3 or self-hosted MinIO) via STORAGE_DRIVER=s3.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  install(context) {
    context.copyPackageFile('docker-compose.storage.yml');
    context.copyRuntime();

    context.nextSteps([
      `Import ${pc.bold('StorageModule')} into src/app.module.ts`,
      `Inject ${pc.bold('STORAGE_PROVIDER')} anywhere and call ${pc.bold('.put()')}/${pc.bold('.signedUrl()')}/${pc.bold('.remove()')}`,
      'For the S3 driver: run "docker compose -f docker-compose.storage.yml up -d" (MinIO console on the mapped 9001 port) and set STORAGE_DRIVER=s3 + STORAGE_S3_* env vars',
    ]);
  },
});
