import { TenantContextStorage } from './tenant-context';
import { isCurrentTenantFileKey, isTenantFileKey } from './tenant-file-key';

describe('tenant file keys', () => {
  it("accepts a key under the tenant's prefix", () => {
    expect(isTenantFileKey('tenant-a/x.png', 'tenant-a')).toBe(true);
  });

  it.each([
    'tenant-b/x.png',
    'tenant-a',
    'tenant-a/',
    'tenant-a/../tenant-b/x.png',
    'tenant-a//x.png',
    'x.png',
    '[erased]',
  ])('refuses %s', (key) => {
    expect(isTenantFileKey(key, 'tenant-a')).toBe(false);
  });

  it('reads the tenant from the context, and refuses every key outside one', () => {
    expect(isCurrentTenantFileKey('tenant-a/x.png')).toBe(false);
    expect(
      TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
        isCurrentTenantFileKey('tenant-a/x.png'),
      ),
    ).toBe(true);
    expect(
      TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
        isCurrentTenantFileKey('tenant-b/x.png'),
      ),
    ).toBe(false);
  });
});
