import { Test } from '@nestjs/testing';
import { CacheService } from '#technical/cache/cache.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import type {
  PresignedUpload,
  StorageDriver,
  StoredObject,
  StoredObjectStat,
} from '#technical/storage/storage-driver';
import { StorageDriverRegistry } from './storage-driver.registry';
import { StorageUploadIntentMismatchException } from './storage-upload-intent-mismatch.exception';
import { StorageUploadIntentNotFoundException } from './storage-upload-intent-not-found.exception';
import { StorageUploadIntentService } from './storage-upload-intent.service';
import { LocalStorageDriver } from './local-storage.driver';
import { StoragePresignUnsupportedException } from './storage-presign-unsupported.exception';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';

function inTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId }, run);
}

class FakeDriver implements StorageDriver {
  private readonly objects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();

  put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve({ key, contentType });
  }

  get(key: string): Promise<Buffer> {
    return Promise.resolve(this.objects.get(key)?.body ?? Buffer.alloc(0));
  }

  remove(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  signedUrl(key: string): Promise<string> {
    return Promise.resolve(`https://fake-store.test/${key}?signed=1`);
  }

  presignPut(key: string): Promise<PresignedUpload> {
    return Promise.resolve({ url: `https://fake-store.test/${key}?upload=1` });
  }

  stat(key: string): Promise<StoredObjectStat | null> {
    const object = this.objects.get(key);
    return Promise.resolve(
      object
        ? { size: object.body.byteLength, contentType: object.contentType }
        : null,
    );
  }

  simulateUpload(key: string, body: Buffer, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }
}

describe('StorageUploadIntentService', () => {
  let cache: CacheService;
  let driver: FakeDriver;
  let service: StorageUploadIntentService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();
    cache = module.get(CacheService);
  });

  beforeEach(() => {
    driver = new FakeDriver();
    const registry = { active: driver } as unknown as StorageDriverRegistry;
    service = new StorageUploadIntentService(registry, cache);
  });

  afterEach(async () => {
    await inTenant('tenant-a', () => cache.invalidate(''));
  });

  afterAll(async () => {
    await cache.onModuleDestroy();
  });

  it('presigns a PUT and records an intent for a key it generates itself', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 10 }),
    );

    expect(intent.key).toMatch(/^tenant-a\/[0-9a-f-]{36}\.png$/);
    expect(intent.url).toContain('upload=1');
  });

  it('rejects a content type outside the allowlist', async () => {
    await expect(
      inTenant('tenant-a', () =>
        service.create({ contentType: 'text/html', size: 10 }),
      ),
    ).rejects.toThrow(StorageUploadRejectedException);
  });

  it('rejects a declared size over the configured limit', async () => {
    await expect(
      inTenant('tenant-a', () =>
        service.create({
          contentType: 'image/png',
          size: 10 * 1024 * 1024 + 1,
        }),
      ),
    ).rejects.toThrow(StorageUploadRejectedException);
  });

  it('confirms when the object genuinely exists and matches the intent', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(intent.key, Buffer.from('kept'), 'image/png');

    const confirmed = await inTenant('tenant-a', () =>
      service.confirm(intent.key),
    );

    expect(confirmed.key).toBe(intent.key);
  });

  it('refuses to confirm a key with no matching intent', async () => {
    await expect(
      inTenant('tenant-a', () => service.confirm('tenant-a/unknown.png')),
    ).rejects.toThrow(StorageUploadIntentNotFoundException);
  });

  it('refuses to confirm when nothing was actually uploaded', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );

    await expect(
      inTenant('tenant-a', () => service.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentMismatchException);
  });

  it('refuses to confirm when the uploaded size does not match what was authorised', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(
      intent.key,
      Buffer.from('way too much data'),
      'image/png',
    );

    await expect(
      inTenant('tenant-a', () => service.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentMismatchException);
  });

  it('refuses to confirm when the uploaded content type was swapped', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(intent.key, Buffer.from('kept'), 'text/html');

    await expect(
      inTenant('tenant-a', () => service.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentMismatchException);
  });

  it('refuses a second confirm of the same intent', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(intent.key, Buffer.from('kept'), 'image/png');
    await inTenant('tenant-a', () => service.confirm(intent.key));

    await expect(
      inTenant('tenant-a', () => service.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentNotFoundException);
  });

  it('lets only one of several concurrent confirms succeed', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(intent.key, Buffer.from('kept'), 'image/png');

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        inTenant('tenant-a', () => service.confirm(intent.key)),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('refuses to confirm once the intent has expired', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(intent.key, Buffer.from('kept'), 'image/png');
    await inTenant('tenant-a', () => cache.invalidate('upload-intent:'));

    await expect(
      inTenant('tenant-a', () => service.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentNotFoundException);
  });

  it('gives an intent a time to live', async () => {
    const setSpy = jest.spyOn(cache, 'set');
    await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );

    expect(setSpy).toHaveBeenCalledWith(
      expect.stringContaining('upload-intent:'),
      expect.anything(),
      300,
    );
    setSpy.mockRestore();
  });

  it('does not let another tenant confirm an intent', async () => {
    const intent = await inTenant('tenant-a', () =>
      service.create({ contentType: 'image/png', size: 4 }),
    );
    driver.simulateUpload(intent.key, Buffer.from('kept'), 'image/png');

    await expect(
      inTenant('tenant-b', () => service.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentNotFoundException);
  });

  it('refuses to issue an intent on a driver with no presign', async () => {
    const registry = {
      active: new LocalStorageDriver(),
    } as unknown as StorageDriverRegistry;
    const localService = new StorageUploadIntentService(registry, cache);

    await expect(
      inTenant('tenant-a', () =>
        localService.create({ contentType: 'image/png', size: 4 }),
      ),
    ).rejects.toThrow(StoragePresignUnsupportedException);
  });
});
