import { TenantContextStorage } from './tenant-context';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TenantContextStorage', () => {
  it('throws when read outside of any tenant context', () => {
    expect(() => TenantContextStorage.getTenantId()).toThrow(
      'No tenant context available outside of a request',
    );
  });

  it('exposes the tenant set for the current run', () => {
    TenantContextStorage.run({ tenantId: 'tenant-a' }, () => {
      expect(TenantContextStorage.getTenantId()).toBe('tenant-a');
    });
  });

  it('never leaks one concurrent request tenant into another', async () => {
    const runAsTenant = (tenantId: string, readDelayMs: number) =>
      TenantContextStorage.run({ tenantId }, async () => {
        await delay(readDelayMs);
        return TenantContextStorage.getTenantId();
      });

    const [resultA, resultB] = await Promise.all([
      runAsTenant('tenant-a', 20),
      runAsTenant('tenant-b', 5),
    ]);

    expect(resultA).toBe('tenant-a');
    expect(resultB).toBe('tenant-b');
  });
});
