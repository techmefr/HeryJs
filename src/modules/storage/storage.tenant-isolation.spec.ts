import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import type { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CacheService } from '#technical/cache/cache.service';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { LocalStorageDriver } from './local-storage.driver';
import { StorageDriverRegistry } from './storage-driver.registry';
import { StorageNotInTenantException } from './storage-not-in-tenant.exception';
import { StorageUploadIntentNotFoundException } from './storage-upload-intent-not-found.exception';
import { StorageUploadIntentService } from './storage-upload-intent.service';
import { StorageService } from './storage.service';

function inTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId }, run);
}

describe('tenant isolation', () => {
  const tenantA = `iso-a-${Date.now()}`;
  const tenantB = `iso-b-${Date.now()}`;
  const driver = new LocalStorageDriver();
  const registry = new StorageDriverRegistry(
    {},
    driver,
    new DriverResolver({} as ModuleRef),
  );
  registry.onModuleInit();
  const storage = new StorageService(registry);
  let cache: CacheService;
  let intents: StorageUploadIntentService;

  async function uploadAs(tenantId: string): Promise<string> {
    const stored = await inTenant(tenantId, () =>
      storage.upload({
        buffer: Buffer.from('bytes'),
        mimetype: 'image/png',
        size: 5,
      }),
    );

    return stored.key;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();
    cache = module.get(CacheService);
    const presigning = {
      active: {
        presignPut: (key: string) =>
          Promise.resolve({ url: `https://fake-store.test/${key}` }),
        stat: () => Promise.resolve({ size: 5, contentType: 'image/png' }),
        signedUrl: (key: string) =>
          Promise.resolve(`https://fake-store.test/${key}`),
      },
    } as unknown as StorageDriverRegistry;
    intents = new StorageUploadIntentService(presigning, cache);
  });

  afterAll(async () => {
    await Promise.all(
      [tenantA, tenantB].map((tenant) =>
        rm(path.resolve(process.cwd(), 'storage', tenant), {
          force: true,
          recursive: true,
        }),
      ),
    );
    await cache.onModuleDestroy();
  });

  it('never lists a file of tenant B to tenant A', async () => {
    const own = await uploadAs(tenantA);
    const foreign = await uploadAs(tenantB);

    const listed = await inTenant(tenantA, () => storage.list());

    expect(listed.map((file) => file.key)).toContain(own);
    expect(listed.map((file) => file.key)).not.toContain(foreign);
  });

  it('never lets tenant A delete a file of tenant B', async () => {
    const foreign = await uploadAs(tenantB);

    await expect(
      inTenant(tenantA, () => storage.removeOwn(foreign)),
    ).rejects.toThrow(StorageNotInTenantException);
    await expect(driver.stat(foreign)).resolves.not.toBeNull();
  });

  it('never lets tenant A confirm an upload intent of tenant B', async () => {
    const intent = await inTenant(tenantB, () =>
      intents.create({ contentType: 'image/png', size: 5 }),
    );

    expect(intent.key.startsWith(`${tenantB}/`)).toBe(true);
    await expect(
      inTenant(tenantA, () => intents.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentNotFoundException);
  });

  it('leaves the pending intent of tenant B in place after tenant A tries to confirm it', async () => {
    const intent = await inTenant(tenantB, () =>
      intents.create({ contentType: 'image/png', size: 5 }),
    );

    await expect(
      inTenant(tenantA, () => intents.confirm(intent.key)),
    ).rejects.toThrow(StorageUploadIntentNotFoundException);

    await expect(
      inTenant(tenantB, () => intents.confirm(intent.key)),
    ).resolves.toMatchObject({ key: intent.key });
  });

  it('writes every key of tenant A under its own prefix only', async () => {
    const key = await uploadAs(tenantA);
    const intent = await inTenant(tenantA, () =>
      intents.create({ contentType: 'image/png', size: 5 }),
    );

    expect(key.startsWith(`${tenantA}/`)).toBe(true);
    expect(intent.key.startsWith(`${tenantA}/`)).toBe(true);
  });
});
