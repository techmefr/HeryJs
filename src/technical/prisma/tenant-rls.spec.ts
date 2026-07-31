import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';

describe('row-level security on Workout (opt-in, real database)', () => {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const superuserClient = new PrismaClient({ adapter });

  const roleName = `heryjs_rls_test_${randomUUID().replace(/-/g, '')}`;
  const tenantA = `tenant-a-${randomUUID()}`;
  const tenantB = `tenant-b-${randomUUID()}`;
  let ownerId: string;
  let tenantBWorkoutId: string;
  let restrictedClient: PrismaClient;

  beforeAll(async () => {
    await superuserClient.$connect();

    const owner = await superuserClient.user.create({
      data: { email: `rls-owner-${randomUUID()}@example.test` },
    });
    ownerId = owner.id;

    await superuserClient.workout.create({
      data: { title: 'tenant A workout', ownerId, tenantId: tenantA },
    });
    const tenantBWorkout = await superuserClient.workout.create({
      data: { title: 'tenant B workout', ownerId, tenantId: tenantB },
    });
    tenantBWorkoutId = tenantBWorkout.id;

    await superuserClient.$executeRawUnsafe(
      `CREATE ROLE "${roleName}" LOGIN PASSWORD 'test' NOSUPERUSER NOBYPASSRLS`,
    );
    await superuserClient.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO "${roleName}"`,
    );
    await superuserClient.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "Workout" TO "${roleName}"`,
    );

    const restrictedUrl = new URL(env.DATABASE_URL);
    restrictedUrl.username = roleName;
    restrictedUrl.password = 'test';
    const restrictedAdapter = new PrismaPg({
      connectionString: restrictedUrl.toString(),
    });
    restrictedClient = new PrismaClient({ adapter: restrictedAdapter });
    await restrictedClient.$connect();
  });

  afterAll(async () => {
    await restrictedClient.$disconnect();
    await superuserClient.workout.deleteMany({ where: { ownerId } });
    await superuserClient.user.delete({ where: { id: ownerId } });
    await superuserClient.$executeRawUnsafe(
      `REVOKE ALL ON "Workout" FROM "${roleName}"`,
    );
    await superuserClient.$executeRawUnsafe(
      `REVOKE ALL ON SCHEMA public FROM "${roleName}"`,
    );
    await superuserClient.$executeRawUnsafe(`DROP ROLE "${roleName}"`);
    await superuserClient.$disconnect();
  });

  it('hides every row from a restricted role that never sets the tenant session variable', async () => {
    const rows = await restrictedClient.workout.findMany({
      where: { ownerId },
    });

    expect(rows).toHaveLength(0);
  });

  it('scopes visibility to the tenant set on the session, even with no application-level filter', async () => {
    await restrictedClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;

      const rows = await tx.workout.findMany({ where: { ownerId } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(tenantA);
    });

    await restrictedClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantB}, true)`;

      const rows = await tx.workout.findMany({ where: { ownerId } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(tenantB);
    });
  });

  it('blocks a write into a tenant the session is not scoped to', async () => {
    await expect(
      restrictedClient.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;

        return tx.workout.update({
          where: { id: tenantBWorkoutId },
          data: { title: 'smuggled update' },
        });
      }),
    ).rejects.toThrow();
  });
});
