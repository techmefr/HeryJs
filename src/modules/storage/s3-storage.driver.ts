import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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
  StoredObjectSummary,
} from '#technical/public/drivers';

const DEFAULT_TTL_SECONDS = 900;
const PRESIGN_PUT_TTL_SECONDS = 300;

interface S3Connection {
  bucket: string;
  client: S3Client;
}

// Works against real S3 or any S3-compatible endpoint (self-hosted MinIO
// included) -- only STORAGE_S3_ENDPOINT changes between the two.
//
// The client is built on first use, not when Nest instantiates the provider.
// The module always provides this driver, so a constructor that read the
// environment would refuse a production boot over S3 credentials on every app
// that stores on local disk.
@Injectable()
export class S3StorageDriver implements StorageDriver {
  private connection?: S3Connection;

  private connect(): S3Connection {
    if (!this.connection) {
      const env = s3StorageEnv();

      this.connection = {
        bucket: env.STORAGE_S3_BUCKET,
        client: new S3Client({
          region: env.STORAGE_S3_REGION,
          endpoint: env.STORAGE_S3_ENDPOINT,
          forcePathStyle: Boolean(env.STORAGE_S3_ENDPOINT),
          credentials: {
            accessKeyId: env.STORAGE_S3_ACCESS_KEY,
            secretAccessKey: env.STORAGE_S3_SECRET_KEY,
          },
        }),
      };
    }

    return this.connection;
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    const { bucket, client } = this.connect();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return { key, contentType };
  }

  async get(key: string): Promise<Buffer> {
    const { bucket, client } = this.connect();

    const { Body } = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    if (!Body) {
      return Buffer.alloc(0);
    }

    return Buffer.from(await Body.transformToByteArray());
  }

  async remove(key: string): Promise<void> {
    const { bucket, client } = this.connect();

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async signedUrl(
    key: string,
    expiresInSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    const { bucket, client } = this.connect();

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedUpload> {
    const { bucket, client } = this.connect();

    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
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
    const { bucket, client } = this.connect();

    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
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

  async list(prefix: string, limit: number): Promise<StoredObjectSummary[]> {
    const { bucket, client } = this.connect();

    const { Contents = [] } = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: limit,
      }),
    );

    return Contents.flatMap((object) =>
      object.Key ? [{ key: object.Key, size: object.Size ?? 0 }] : [],
    );
  }
}
