import { TenantContextStorage } from './tenant-context';

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
    let releaseA = (): void => undefined;
    const aMayRead = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const runAsTenant = (tenantId: string, beforeRead: Promise<void>) =>
      TenantContextStorage.run({ tenantId }, async () => {
        await beforeRead;
        return TenantContextStorage.getTenantId();
      });

    const pendingA = runAsTenant('tenant-a', aMayRead);
    const resultB = await runAsTenant('tenant-b', Promise.resolve());
    releaseA();
    const resultA = await pendingA;

    expect(resultA).toBe('tenant-a');
    expect(resultB).toBe('tenant-b');
  });
});
