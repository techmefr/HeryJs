import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { LocalStorageProvider } from './local-storage.provider';
import { StorageService } from './storage.service';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';

function inTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId }, run);
}

describe('StorageService uploads', () => {
  const provider = new LocalStorageProvider();
  const service = new StorageService(provider);
  const writtenKeys: string[] = [];

  afterAll(async () => {
    await Promise.all(
      writtenKeys.map((key) =>
        rm(path.resolve(process.cwd(), 'storage', key), {
          force: true,
          recursive: true,
        }),
      ),
    );
    await Promise.all(
      writtenKeys.map((key) =>
        rm(path.resolve(process.cwd(), 'storage', `${key}.meta.json`), {
          force: true,
        }),
      ),
    );
  });

  it('stores an allowed content type under a key it generates itself, prefixed by the tenant', async () => {
    const stored = await inTenant('tenant-a', () =>
      service.upload({
        buffer: Buffer.from('fake-png-bytes'),
        mimetype: 'image/png',
        size: 14,
      }),
    );
    writtenKeys.push(stored.key);

    expect(stored.key).toMatch(/^tenant-a\/[0-9a-f-]{36}\.png$/);
    expect(stored.url).toContain(encodeURIComponent(stored.key));
    await expect(provider.contentTypeOf(stored.key)).resolves.toBe('image/png');
  });

  it('never derives the key from anything the caller sent', async () => {
    const first = await inTenant('tenant-a', () =>
      service.upload({
        buffer: Buffer.from('a'),
        mimetype: 'image/png',
        size: 1,
      }),
    );
    const second = await inTenant('tenant-a', () =>
      service.upload({
        buffer: Buffer.from('a'),
        mimetype: 'image/png',
        size: 1,
      }),
    );
    writtenKeys.push(first.key, second.key);

    expect(first.key).not.toBe(second.key);
  });

  it('keeps two tenants from ever landing on the same key', async () => {
    const fromA = await inTenant('tenant-a', () =>
      service.upload({
        buffer: Buffer.from('a'),
        mimetype: 'image/png',
        size: 1,
      }),
    );
    const fromB = await inTenant('tenant-b', () =>
      service.upload({
        buffer: Buffer.from('a'),
        mimetype: 'image/png',
        size: 1,
      }),
    );
    writtenKeys.push(fromA.key, fromB.key);

    expect(fromA.key.startsWith('tenant-a/')).toBe(true);
    expect(fromB.key.startsWith('tenant-b/')).toBe(true);
  });

  it('rejects a content type outside the allowlist', async () => {
    await expect(
      inTenant('tenant-a', () =>
        service.upload({
          buffer: Buffer.from('<script>alert(1)</script>'),
          mimetype: 'text/html',
          size: 26,
        }),
      ),
    ).rejects.toThrow(StorageUploadRejectedException);
  });

  it('rejects a file over the configured size limit', async () => {
    await expect(
      inTenant('tenant-a', () =>
        service.upload({
          buffer: Buffer.alloc(1),
          mimetype: 'image/png',
          size: 10 * 1024 * 1024 + 1,
        }),
      ),
    ).rejects.toThrow(StorageUploadRejectedException);
  });
});
