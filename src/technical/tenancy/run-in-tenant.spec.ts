import { TenantContextStorage } from './tenant-context';
import { runInTenant } from './run-in-tenant';

describe('runInTenant', () => {
  it('opens a tenant context for work that has no request behind it', async () => {
    expect(() => TenantContextStorage.getTenantId()).toThrow();

    const seen = await runInTenant('tenant-a', async () =>
      Promise.resolve(TenantContextStorage.getTenantId()),
    );

    expect(seen).toBe('tenant-a');
  });

  it('attributes the write to nobody unless an actor is passed', async () => {
    const withoutActor = await runInTenant('tenant-a', async () =>
      Promise.resolve(TenantContextStorage.getUserId()),
    );
    const withActor = await runInTenant(
      'tenant-a',
      async () => Promise.resolve(TenantContextStorage.getUserId()),
      { userId: 'user-1' },
    );

    expect(withoutActor).toBeNull();
    expect(withActor).toBe('user-1');
  });

  it('closes the context again once the work is done', async () => {
    await runInTenant('tenant-a', async () => Promise.resolve());

    expect(() => TenantContextStorage.getTenantId()).toThrow();
  });
});
