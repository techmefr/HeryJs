import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import type { ModuleRef } from '@nestjs/core';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { LocalStorageDriver } from './local-storage.driver';
import { StorageDriverRegistry } from './storage-driver.registry';
import { StorageService } from './storage.service';
import { StorageNotInTenantException } from './storage-not-in-tenant.exception';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';

function inTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId }, run);
}

describe('StorageService uploads', () => {
  const driver = new LocalStorageDriver();
  const registry = new StorageDriverRegistry(
    {},
    driver,
    new DriverResolver({} as ModuleRef),
  );
  registry.onModuleInit();
  const service = new StorageService(registry);
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
    await expect(driver.contentTypeOf(stored.key)).resolves.toBe('image/png');
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

describe('StorageService admin operations', () => {
  const driver = new LocalStorageDriver();
  const registry = new StorageDriverRegistry(
    {},
    driver,
    new DriverResolver({} as ModuleRef),
  );
  registry.onModuleInit();
  const service = new StorageService(registry);
  const written: string[] = [];

  async function uploadAs(tenantId: string): Promise<string> {
    const stored = await inTenant(tenantId, () =>
      service.upload({
        buffer: Buffer.from('bytes'),
        mimetype: 'image/png',
        size: 5,
      }),
    );
    written.push(stored.key);

    return stored.key;
  }

  afterAll(async () => {
    await Promise.all(
      ['admin-a', 'admin-b'].map((tenant) =>
        rm(path.resolve(process.cwd(), 'storage', tenant), {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it('lists the current tenant files and never another tenant', async () => {
    const own = await uploadAs('admin-a');
    const other = await uploadAs('admin-b');

    const listed = await inTenant('admin-a', () => service.list());

    expect(listed.map((file) => file.key)).toEqual([own]);
    expect(listed.map((file) => file.key)).not.toContain(other);
    expect(listed[0]?.size).toBe(5);
    expect(listed[0]?.url).toContain(encodeURIComponent(own));
  });

  it('deletes a file of the current tenant', async () => {
    const key = await uploadAs('admin-a');

    await inTenant('admin-a', () => service.removeOwn(key));

    await expect(driver.stat(key)).resolves.toBeNull();
  });

  it('refuses to delete a key of another tenant, and leaves the file', async () => {
    const key = await uploadAs('admin-b');

    await expect(inTenant('admin-a', () => service.removeOwn(key))).rejects.toThrow(StorageNotInTenantException);
    await expect(driver.stat(key)).resolves.not.toBeNull();
  });
});
