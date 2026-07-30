import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TenantContextStorage } from '../tenancy/tenant-context';
import {
  createTenantScopedPrismaClient,
  TenantScopedPrismaClient,
} from './prisma.client';

type WorkoutInputWithoutTenantId = Omit<
  Prisma.WorkoutUncheckedCreateInput,
  'tenantId'
>;

describe('tenant-scoped Prisma client (real database)', () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const rawClient = new PrismaClient({ adapter });
  let scopedClient: TenantScopedPrismaClient;

  const tenantA = `tenant-a-${randomUUID()}`;
  const tenantB = `tenant-b-${randomUUID()}`;
  let ownerId: string;

  /**
   * The generated Prisma input requires a tenant id, while the point of the
   * scoping extension is that callers never supply one. Widening happens once
   * here so every field the tests do pass stays type-checked.
   */
  const createWorkout = (data: WorkoutInputWithoutTenantId) =>
    scopedClient.workout.create({
      data: data as Prisma.WorkoutUncheckedCreateInput,
    });

  beforeAll(async () => {
    await rawClient.$connect();
    scopedClient = createTenantScopedPrismaClient();
    await scopedClient.$connect();

    const owner = await rawClient.user.create({
      data: {
        email: `owner-${randomUUID()}@example.test`,
      },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await rawClient.workout.deleteMany({ where: { ownerId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    await scopedClient.$disconnect();
  });

  it('injects the current tenant id on create without the caller passing it', async () => {
    await TenantContextStorage.run({ tenantId: tenantA }, async () => {
      await createWorkout({ title: 'from tenant A', ownerId });
    });

    const stored = await rawClient.workout.findMany({ where: { ownerId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tenantId).toBe(tenantA);
  });

  it('never lets tenant B read a record created under tenant A', async () => {
    await TenantContextStorage.run({ tenantId: tenantA }, async () => {
      await createWorkout({ title: 'still tenant A', ownerId });
    });
    await TenantContextStorage.run({ tenantId: tenantB }, async () => {
      await createWorkout({ title: 'tenant B', ownerId });
    });

    const asTenantA = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () => {
        return await scopedClient.workout.findMany({});
      },
    );
    const asTenantB = await TenantContextStorage.run(
      { tenantId: tenantB },
      async () => {
        return await scopedClient.workout.findMany({});
      },
    );

    expect(asTenantA.every((workout) => workout.tenantId === tenantA)).toBe(
      true,
    );
    expect(asTenantB.every((workout) => workout.tenantId === tenantB)).toBe(
      true,
    );
    expect(asTenantA).toHaveLength(2);
    expect(asTenantB).toHaveLength(1);
  });
});
