import { LocalFeatureFlagsDriver } from './local-feature-flags.driver';

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
  });
}

describe('LocalFeatureFlagsDriver', () => {
  describe('isEnabled', () => {
    it('returns the tenant flag when one exists', async () => {
      const prisma = {
        featureFlag: {
          findUnique: jest.fn().mockResolvedValue({ enabled: true }),
        },
      } as never;
      const driver = new LocalFeatureFlagsDriver(prisma);

      await expect(driver.isEnabled('beta', 'tenant-1')).resolves.toBe(true);
    });

    it('falls back to the global flag when no tenant override exists', async () => {
      const prisma = {
        featureFlag: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue({ enabled: true }),
        },
      } as never;
      const driver = new LocalFeatureFlagsDriver(prisma);

      await expect(driver.isEnabled('beta', 'tenant-1')).resolves.toBe(true);
    });

    it('defaults to disabled when nothing is declared anywhere', async () => {
      const prisma = {
        featureFlag: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never;
      const driver = new LocalFeatureFlagsDriver(prisma);

      await expect(driver.isEnabled('beta')).resolves.toBe(false);
    });
  });

  describe('set', () => {
    it('updates the existing row when one is already there', async () => {
      const update = jest.fn().mockResolvedValue({ id: '1', enabled: true });
      const prisma = {
        featureFlag: {
          findFirst: jest.fn().mockResolvedValue({ id: '1' }),
          update,
        },
      } as never;
      const driver = new LocalFeatureFlagsDriver(prisma);

      await driver.set('beta', true);

      expect(update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { enabled: true },
      });
    });

    /**
     * Issue #43: two concurrent calls both pass findFirst and both reach
     * create. Postgres treats every NULL as distinct, so the partial unique
     * index does not stop a duplicate global row -- it turns the second
     * insert into a P2002 instead. This must resolve into the update the
     * caller meant, not bubble the violation up.
     */
    it('turns a concurrent create collision into an update of the winning row', async () => {
      const update = jest
        .fn()
        .mockResolvedValue({ id: 'winner', enabled: true });
      const prisma = {
        featureFlag: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(uniqueViolation()),
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'winner' }),
          update,
        },
      } as never;
      const driver = new LocalFeatureFlagsDriver(prisma);

      await driver.set('beta', true);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'winner' },
        data: { enabled: true },
      });
    });

    it('rethrows a create failure that is not a unique violation', async () => {
      const prisma = {
        featureFlag: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(new Error('connection lost')),
        },
      } as never;
      const driver = new LocalFeatureFlagsDriver(prisma);

      await expect(driver.set('beta', true)).rejects.toThrow('connection lost');
    });
  });
});
