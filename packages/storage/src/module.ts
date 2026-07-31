import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const COMPOSE_FILE = 'docker-compose.storage.yml';
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/modules/storage';

registerModule({
  name: 'storage',
  channel: 'official',
  description:
    'Add file storage behind a swappable provider: local disk (signed local URLs) by default, S3-compatible (real S3 or self-hosted MinIO) via STORAGE_DRIVER=s3.',
  dependencies: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  install() {
    if (existsSync(COMPOSE_FILE)) {
      console.log(pc.yellow(`${COMPOSE_FILE} already exists, skipping.`));
    } else {
      writeFileSync(
        COMPOSE_FILE,
        readFileSync(path.join(__dirname, '..', COMPOSE_FILE), 'utf8'),
      );
      console.log(pc.green(`✔ ${COMPOSE_FILE}`));
    }

    copyRuntime(RUNTIME_DIR, DEST_DIR);

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Import ${pc.bold('StorageModule')} into src/app.module.ts`,
    );
    console.log(
      `  2. Inject ${pc.bold('STORAGE_PROVIDER')} anywhere and call ${pc.bold('.put()')}/${pc.bold('.signedUrl()')}/${pc.bold('.remove()')}`,
    );
    console.log(
      `  3. For the S3 driver: run "docker compose -f docker-compose.storage.yml up -d" (MinIO console on the mapped 9001 port) and set STORAGE_DRIVER=s3 + STORAGE_S3_* env vars`,
    );
  },
});
