import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { s3StorageEnv } from './storage.env';
import type {
  PresignedUpload,
  StorageDriver,
  StoredObject,
  StoredObjectStat,
} from '#kernel/storage/storage-driver';

const DEFAULT_TTL_SECONDS = 900;
const PRESIGN_PUT_TTL_SECONDS = 300;

// Works against real S3 or any S3-compatible endpoint (self-hosted MinIO
// included) -- only STORAGE_S3_ENDPOINT changes between the two.
@Injectable()
export class S3StorageDriver implements StorageDriver {
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

  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return { key, contentType };
  }

  async get(key: string): Promise<Buffer> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!Body) {
      return Buffer.alloc(0);
    }

    return Buffer.from(await Body.transformToByteArray());
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

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: PRESIGN_PUT_TTL_SECONDS },
    );

    return {
      url,
      headers: { 'Content-Type': contentType },
    };
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }
}
