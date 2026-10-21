import { randomUUID } from 'node:crypto';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { S3StorageDriver } from '../src/runtime/s3-storage.driver';
import { StorageUploadIntentService } from '../src/runtime/storage-upload-intent.service';
import { StorageUploadIntentMismatchException } from '../src/runtime/storage-upload-intent-mismatch.exception';
import type { CacheService } from '#kernel/cache/cache.service';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import type { StorageDriverRegistry } from '../src/runtime/storage-driver.registry';

/**
 * This one talks to a real S3-compatible server (MinIO in CI), because what a
 * presigned PUT is worth cannot be read off the URL: the signature either
 * covers the headers the client sends or the store answers 403, and only a
 * store can say which.
 */
const endpoint = process.env.STORAGE_S3_ENDPOINT ?? 'http://localhost:9000';
const bucket = `heryjs-it-${process.pid}`;
const tenant = `tenant-${randomUUID()}`;
const png = Buffer.from('not-really-a-png-but-bytes-are-bytes');

process.env.STORAGE_S3_ENDPOINT = endpoint;
process.env.STORAGE_S3_BUCKET = bucket;
process.env.STORAGE_S3_ACCESS_KEY ??= 'heryjs';
process.env.STORAGE_S3_SECRET_KEY ??= 'heryjs-dev-secret';

class MemoryCache {
  private readonly held = new Map<string, unknown>();

  set(key: string, value: unknown): Promise<void> {
    this.held.set(key, value);

    return Promise.resolve();
  }

  take<T>(key: string): Promise<T | null> {
    const value = (this.held.get(key) as T | undefined) ?? null;
    this.held.delete(key);

    return Promise.resolve(value);
  }
}

const driver = new S3StorageDriver();
const intents = new StorageUploadIntentService(
  { active: driver } as unknown as StorageDriverRegistry,
  new MemoryCache() as unknown as CacheService,
);

function inTenant<T>(run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId: tenant }, run);
}

beforeAll(async () => {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY as string,
      secretAccessKey: process.env.STORAGE_S3_SECRET_KEY as string,
    },
  });

  await client.send(new CreateBucketCommand({ Bucket: bucket }));
});

describe('the S3 driver against a real S3-compatible server', () => {
  it('stores, reads, lists and removes an object', async () => {
    const key = `${tenant}/plain.png`;

    await driver.put(key, png, 'image/png');

    expect(await driver.get(key)).toEqual(png);
    expect(await driver.stat(key)).toEqual({
      size: png.byteLength,
      contentType: 'image/png',
    });
    expect(await driver.list(`${tenant}/`, 10)).toEqual([
      { key, size: png.byteLength },
    ]);

    await driver.remove(key);

    expect(await driver.stat(key)).toBeNull();
  });

  it('serves an object through a presigned GET', async () => {
    const key = `${tenant}/signed.png`;
    await driver.put(key, png, 'image/png');

    const response = await fetch(await driver.signedUrl(key));

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });

  it('completes an upload intent: presigned PUT, then a confirm the store backs up', async () => {
    const intent = await inTenant(() =>
      intents.create({ contentType: 'image/png', size: png.byteLength }),
    );

    const put = await fetch(intent.url, {
      method: 'PUT',
      headers: intent.headers,
      body: png,
    });
    expect(put.status).toBe(200);

    const confirmed = await inTenant(() => intents.confirm(intent.key));

    expect(confirmed.key).toBe(intent.key);
    expect(await driver.get(intent.key)).toEqual(png);
  });

  it('refuses to confirm an intent whose object was never uploaded', async () => {
    const intent = await inTenant(() =>
      intents.create({ contentType: 'image/png', size: png.byteLength }),
    );

    await expect(inTenant(() => intents.confirm(intent.key))).rejects.toThrow(
      StorageUploadIntentMismatchException,
    );
  });

  /**
   * The store accepts a PUT whatever Content-Type it carries (the signature
   * does not bind it), which is exactly why confirm re-reads the object with
   * stat() instead of trusting what the client says it sent.
   */
  it('refuses to confirm an object uploaded with a different content type than authorised', async () => {
    const intent = await inTenant(() =>
      intents.create({ contentType: 'image/png', size: png.byteLength }),
    );

    await fetch(intent.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html' },
      body: png,
    });

    await expect(inTenant(() => intents.confirm(intent.key))).rejects.toThrow(
      /content type/,
    );
  });
});
