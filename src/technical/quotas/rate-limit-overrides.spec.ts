import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { RateLimitOverrides } from './rate-limit-overrides';

function prismaReturning(rows: { name: string; limit: number }[]) {
  const findMany = jest.fn().mockResolvedValue(rows);

  return {
    findMany,
    prisma: { quotaOverride: { findMany } } as never,
  };
}

const inTenant = <T>(tenantId: string, run: () => Promise<T>): Promise<T> =>
  TenantContextStorage.run({ tenantId }, run);

describe('RateLimitOverrides', () => {
  it('returns the limit set for a bucket and nothing for another', async () => {
    const { prisma } = prismaReturning([
      { name: 'rate-limit:write', limit: 90 },
    ]);
    const overrides = new RateLimitOverrides(prisma);

    await inTenant('t1', async () => {
      await expect(overrides.limitFor('write')).resolves.toBe(90);
      await expect(overrides.limitFor('read')).resolves.toBeUndefined();
    });
  });

  it('reads a tenant once, not once per request', async () => {
    const { prisma, findMany } = prismaReturning([]);
    const overrides = new RateLimitOverrides(prisma);

    await inTenant('t1', async () => {
      await overrides.limitFor('read');
      await overrides.limitFor('write');
      await overrides.limitFor('read');
    });

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps one tenant override away from another', async () => {
    const { prisma, findMany } = prismaReturning([
      { name: 'rate-limit:read', limit: 5 },
    ]);
    const overrides = new RateLimitOverrides(prisma);

    await inTenant('t1', () => overrides.limitFor('read'));
    findMany.mockResolvedValueOnce([]);

    await expect(
      inTenant('t2', () => overrides.limitFor('read')),
    ).resolves.toBeUndefined();
  });

  it('reads again once forgotten, so a change is seen by the process that made it', async () => {
    const { prisma, findMany } = prismaReturning([]);
    const overrides = new RateLimitOverrides(prisma);

    await inTenant('t1', () => overrides.limitFor('read'));
    overrides.forget('t1');
    await inTenant('t1', () => overrides.limitFor('read'));

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('fails open to the configured limit when the lookup throws', async () => {
    const overrides = new RateLimitOverrides({
      quotaOverride: {
        findMany: jest.fn().mockRejectedValue(new Error('down')),
      },
    } as never);

    await expect(
      inTenant('t1', () => overrides.limitFor('read')),
    ).resolves.toBeUndefined();
  });

  it('has nothing to say outside a tenant context', async () => {
    const { prisma, findMany } = prismaReturning([]);
    const overrides = new RateLimitOverrides(prisma);

    await expect(overrides.limitFor('read')).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
