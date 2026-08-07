import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { s3StorageEnv } from './storage.env';
import type { StorageProvider } from './storage.types';

const DEFAULT_TTL_SECONDS = 900;

// Works against real S3 or any S3-compatible endpoint (self-hosted MinIO
// included) -- only STORAGE_S3_ENDPOINT changes between the two.
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly env = s3StorageEnv();

  private readonly bucket = this.env.STORAGE_S3_BUCKET;

  private readonly client = new S3Client({
    region: this.env.STORAGE_S3_REGION,
    endpoint: this.env.STORAGE_S3_ENDPOINT,
    forcePathStyle: Boolean(this.env.STORAGE_S3_ENDPOINT),
    credentials: {
      accessKeyId: this.env.STORAGE_S3_ACCESS_KEY,
      secretAccessKey: this.env.STORAGE_S3_SECRET_KEY,
    },
  });

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async signedUrl(
    key: string,
    expiresInSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
