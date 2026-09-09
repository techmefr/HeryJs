import { Test } from '@nestjs/testing';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CacheService } from './cache.service';

function inTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run({ tenantId }, run);
}

describe('CacheService', () => {
  let service: CacheService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();

    service = module.get(CacheService);
  });

  afterEach(async () => {
    await inTenant('tenant-a', () => service.invalidate(''));
    await inTenant('tenant-b', () => service.invalidate(''));
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('reads back what it wrote', async () => {
    await inTenant('tenant-a', () => service.set('report:2026', { total: 42 }));

    const value = await inTenant('tenant-a', () =>
      service.get<{ total: number }>('report:2026'),
    );

    expect(value).toEqual({ total: 42 });
  });

  it('answers null for a key never set', async () => {
    const value = await inTenant('tenant-a', () =>
      service.get('never-written'),
    );

    expect(value).toBeNull();
  });

  it('keeps two tenants from ever reading the same value back', async () => {
    await inTenant('tenant-a', () => service.set('report', 'a-value'));
    await inTenant('tenant-b', () => service.set('report', 'b-value'));

    expect(await inTenant('tenant-a', () => service.get('report'))).toBe(
      'a-value',
    );
    expect(await inTenant('tenant-b', () => service.get('report'))).toBe(
      'b-value',
    );
  });

  it('deletes one key without touching the rest of the tenant', async () => {
    await inTenant('tenant-a', () => service.set('keep', 'still here'));
    await inTenant('tenant-a', () => service.set('drop', 'gone soon'));

    await inTenant('tenant-a', () => service.del('drop'));

    expect(await inTenant('tenant-a', () => service.get('drop'))).toBeNull();
    expect(await inTenant('tenant-a', () => service.get('keep'))).toBe(
      'still here',
    );
  });

  it('invalidates a whole prefix, and nothing outside it', async () => {
    await inTenant('tenant-a', () => service.set('blog-post:1', 'first'));
    await inTenant('tenant-a', () => service.set('blog-post:2', 'second'));
    await inTenant('tenant-a', () => service.set('tag:1', 'unrelated'));

    await inTenant('tenant-a', () => service.invalidate('blog-post:'));

    expect(
      await inTenant('tenant-a', () => service.get('blog-post:1')),
    ).toBeNull();
    expect(
      await inTenant('tenant-a', () => service.get('blog-post:2')),
    ).toBeNull();
    expect(await inTenant('tenant-a', () => service.get('tag:1'))).toBe(
      'unrelated',
    );
  });

  it('never invalidates another tenant while clearing its own prefix', async () => {
    await inTenant('tenant-a', () => service.set('shared-name', 'a-value'));
    await inTenant('tenant-b', () => service.set('shared-name', 'b-value'));

    await inTenant('tenant-a', () => service.invalidate('shared-name'));

    expect(
      await inTenant('tenant-a', () => service.get('shared-name')),
    ).toBeNull();
    expect(await inTenant('tenant-b', () => service.get('shared-name'))).toBe(
      'b-value',
    );
  });
});
