import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const COMPOSE_FILE = 'docker-compose.storage.yml';
const TYPES_FILE = 'src/modules/storage/storage.types.ts';
const INVALID_KEY_FILE = 'src/modules/storage/invalid-storage-key.exception.ts';
const LOCAL_PROVIDER_FILE = 'src/modules/storage/local-storage.provider.ts';
const S3_PROVIDER_FILE = 'src/modules/storage/s3-storage.provider.ts';
const CONTROLLER_FILE = 'src/modules/storage/storage.controller.ts';
const MODULE_FILE = 'src/modules/storage/storage.module.ts';

const COMPOSE_CONTENT = `services:
  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: heryjs
      MINIO_ROOT_PASSWORD: heryjs-dev-secret
    ports:
      - '9000'
      - '9001'
    volumes:
      - heryjs-minio:/data

volumes:
  heryjs-minio:
`;

const TYPES_CONTENT = `export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
`;

const INVALID_KEY_CONTENT = `import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../technical/errors/domain.exception';

export class InvalidStorageKeyException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'storage.key.invalid',
      'A storage key must stay inside the storage root.',
      { key },
    );
  }
}
`;

const LOCAL_PROVIDER_CONTENT = `import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { env } from '../../technical/config/env';
import { InvalidStorageKeyException } from './invalid-storage-key.exception';
import type { StorageProvider } from './storage.types';

const ROOT = path.resolve(process.cwd(), 'storage');
const DEFAULT_TTL_SECONDS = 900;

/**
 * A key names a location inside ROOT and nothing else. \`path.join\` walks out of
 * the root without complaint on a key containing \`../\`, and this module's own
 * instructions tell developers to inject the provider and pass keys straight in,
 * so refusing the escape belongs here rather than in every call site.
 */
function insideRoot(key: string): string {
  const target = path.resolve(ROOT, key);

  if (target !== ROOT && !target.startsWith(\`\${ROOT}\${path.sep}\`)) {
    throw new InvalidStorageKeyException(key);
  }

  return target;
}

// Zero-config default: files live on local disk, "signed URLs" are served
// by StorageController with an HMAC signature + expiry, the same trick
// already used for the signal SSE token (no header, so the signature
// travels in the query string). Swap STORAGE_PROVIDER for S3StorageProvider
// (or any S3-compatible endpoint, including a self-hosted MinIO) for
// anything beyond local dev.
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async put(key: string, body: Buffer): Promise<void> {
    const target = insideRoot(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async remove(key: string): Promise<void> {
    await rm(insideRoot(key), { force: true });
  }

  signedUrl(key: string, expiresInSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
    const exp = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(key, exp);
    return Promise.resolve(
      \`/storage/\${encodeURIComponent(key)}?exp=\${exp}&sig=\${signature}\`,
    );
  }

  verify(key: string, exp: number, signature: string): boolean {
    if (Date.now() > exp) {
      return false;
    }

    const expected = Buffer.from(this.sign(key, exp));
    const provided = Buffer.from(signature);

    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }

  async read(key: string): Promise<Buffer> {
    return readFile(insideRoot(key));
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', env.SIGNAL_TOKEN_SECRET)
      .update(\`\${key}:\${exp}\`)
      .digest('base64url');
  }
}
`;

const S3_PROVIDER_CONTENT = `import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import type { StorageProvider } from './storage.types';

const BUCKET = process.env.STORAGE_S3_BUCKET ?? 'heryjs';
const DEFAULT_TTL_SECONDS = 900;

// Works against real S3 or any S3-compatible endpoint (self-hosted MinIO
// included) -- only STORAGE_S3_ENDPOINT changes between the two.
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client = new S3Client({
    region: process.env.STORAGE_S3_REGION ?? 'us-east-1',
    endpoint: process.env.STORAGE_S3_ENDPOINT,
    forcePathStyle: Boolean(process.env.STORAGE_S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY ?? 'heryjs',
      secretAccessKey: process.env.STORAGE_S3_SECRET_KEY ?? 'heryjs-dev-secret',
    },
  });

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  }

  async signedUrl(key: string, expiresInSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
`;

const CONTROLLER_CONTENT = `import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LocalStorageProvider } from './local-storage.provider';

// Only relevant for the local driver -- S3 and MinIO serve signed URLs
// directly from the object store, this app never proxies that traffic.
@Controller('storage')
export class StorageController {
  constructor(private readonly local: LocalStorageProvider) {}

  @Get(':key')
  async serve(
    @Param('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!this.local.verify(key, Number(exp), sig)) {
      throw new NotFoundException();
    }

    const body = await this.local.read(key);
    res.send(body);
  }
}
`;

const MODULE_CONTENT = `import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageController } from './storage.controller';
import { STORAGE_PROVIDER } from './storage.types';

const DRIVER = process.env.STORAGE_DRIVER ?? 'local';

@Module({
  controllers: DRIVER === 'local' ? [StorageController] : [],
  providers: [
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useClass: DRIVER === 's3' ? S3StorageProvider : LocalStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
`;

registerModule({
  name: 'storage',
  description:
    'Add file storage behind a swappable provider: local disk (signed local URLs) by default, S3-compatible (real S3 or self-hosted MinIO) via STORAGE_DRIVER=s3.',
  dependencies: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  install() {
    const files: Record<string, string> = {
      [COMPOSE_FILE]: COMPOSE_CONTENT,
      [TYPES_FILE]: TYPES_CONTENT,
      [INVALID_KEY_FILE]: INVALID_KEY_CONTENT,
      [LOCAL_PROVIDER_FILE]: LOCAL_PROVIDER_CONTENT,
      [S3_PROVIDER_FILE]: S3_PROVIDER_CONTENT,
      [CONTROLLER_FILE]: CONTROLLER_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

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
