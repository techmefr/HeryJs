import type { HeryConfig } from '#technical/config/hery-config.types';
import { periodKey } from './quota-period';
import {
  QuotaNotDeclaredException,
  TenantQuotaExceededException,
} from './quota.exceptions';
import { QuotasService } from './quotas.service';

const config: HeryConfig = {
  quotas: {
    projects: { limit: 3, period: 'total' },
    'api-calls': { limit: 100 },
  },
};

function build(options: {
  override?: number;
  updates?: ({ used: number } | null)[];
}) {
  const updateManyAndReturn = jest.fn();
  (options.updates ?? []).forEach((outcome) =>
    updateManyAndReturn.mockResolvedValueOnce(outcome ? [outcome] : []),
  );
  const createMany = jest.fn().mockResolvedValue({ count: 1 });
  const findFirstUsage = jest.fn().mockResolvedValue({ used: 3 });
  const prisma = {
    quotaOverride: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.override === undefined ? null : { limit: options.override },
        ),
    },
    quotaUsage: {
      updateManyAndReturn,
      createMany,
      findFirst: findFirstUsage,
    },
  } as never;
  const service = new QuotasService(config, prisma, {
    forget: jest.fn(),
  } as never);

  return { service, updateManyAndReturn, createMany };
}

describe('QuotasService.consume', () => {
  it('increments in one conditional statement when the row exists', async () => {
    const { service, updateManyAndReturn, createMany } = build({
      updates: [{ used: 2 }],
    });

    await expect(service.consume('projects')).resolves.toEqual({
      allowed: true,
      limit: 3,
      used: 2,
      remaining: 1,
    });
    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: { name: 'projects', period: 'total', used: { lte: 2 } },
      data: { used: { increment: 1 } },
      select: { used: true },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('creates the period row empty, without raising on a race, then increments', async () => {
    const { service, createMany } = build({ updates: [null, { used: 1 }] });

    const result = await service.consume('projects');

    expect(result.used).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ name: 'projects', period: 'total', used: 0 }],
      skipDuplicates: true,
    });
  });

  it('refuses when the conditional update finds no room', async () => {
    const { service } = build({ updates: [null, null] });

    await expect(service.consume('projects')).rejects.toBeInstanceOf(
      TenantQuotaExceededException,
    );
  });

  it('refuses an amount larger than the whole limit without touching the count', async () => {
    const { service, updateManyAndReturn } = build({});

    await expect(service.consume('projects', 4)).rejects.toBeInstanceOf(
      TenantQuotaExceededException,
    );
    expect(updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('uses the tenant override instead of the declared default', async () => {
    const { service, updateManyAndReturn } = build({
      override: 10,
      updates: [{ used: 1 }],
    });

    await service.consume('projects');

    expect(updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'projects', period: 'total', used: { lte: 9 } },
      }),
    );
  });

  it('defaults a quota to a monthly period', async () => {
    const { service, updateManyAndReturn } = build({ updates: [{ used: 1 }] });

    await service.consume('api-calls');

    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        name: 'api-calls',
        period: periodKey('month'),
        used: { lte: 99 },
      },
      data: { used: { increment: 1 } },
      select: { used: true },
    });
  });

  it('rejects a quota nobody declared', async () => {
    const { service } = build({});

    await expect(service.consume('nope')).rejects.toBeInstanceOf(
      QuotaNotDeclaredException,
    );
    await expect(service.setOverride('t1', 'nope', 5)).rejects.toBeInstanceOf(
      QuotaNotDeclaredException,
    );
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the amount %s', async (amount) => {
    const { service } = build({});

    await expect(service.consume('projects', amount)).rejects.toBeInstanceOf(
      RangeError,
    );
  });
});
