import {
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
    await this.client.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
    );
  }

  async signedUrl(
    key: string,
    expiresInSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
