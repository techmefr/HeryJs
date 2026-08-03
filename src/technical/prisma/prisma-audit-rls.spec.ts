import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { createTenantScopedPrismaClient as CreateTenantScopedPrismaClient } from './prisma.client';
import type { TenantContextStorage as TenantContextStorageType } from '#technical/tenancy/tenant-context';

/**
 * The tenant extension takes a different path once RLS_ENABLED is true: it
 * runs the query inside its own transaction against the raw client instead of
 * delegating to the next extension in the chain. This pins that the audit
 * extension still observes and logs that write -- it used to sit on the wrong
 * side of the tenant extension and silently miss every entry on this branch.
 */
describe('audit logging under RLS_ENABLED=true (real database)', () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const rawClient = new PrismaClient({ adapter });
  const previousRlsEnabled = process.env.RLS_ENABLED;
  let ownerId: string;

  beforeAll(async () => {
    await rawClient.$connect();
    process.env.RLS_ENABLED = 'true';
    jest.resetModules();

    const owner = await rawClient.user.create({
      data: { email: `rls-audit-owner-${randomUUID()}@example.test` },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await rawClient.workout.deleteMany({ where: { ownerId } });
    await rawClient.auditLog.deleteMany({ where: { model: 'Workout' } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();

    if (previousRlsEnabled === undefined) {
      delete process.env.RLS_ENABLED;
    } else {
      process.env.RLS_ENABLED = previousRlsEnabled;
    }
    jest.resetModules();
  });

  it('writes an audit entry for a create that went through the RLS transaction branch', async () => {
    // Both required from the same fresh module registry (reset above,
    // nothing else has imported either since): the tenant context this test
    // enters has to be the one createTenantScopedPrismaClient's own require
    // of TenantContextStorage reads from, not a stale instance from an
    // earlier module graph with its own separate AsyncLocalStorage.
    let createTenantScopedPrismaClient!: typeof CreateTenantScopedPrismaClient;
    let TenantContextStorage!: typeof TenantContextStorageType;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      createTenantScopedPrismaClient = (
        require('./prisma.client') as {
          createTenantScopedPrismaClient: typeof CreateTenantScopedPrismaClient;
        }
      ).createTenantScopedPrismaClient;

      TenantContextStorage = (
        require('#technical/tenancy/tenant-context') as {
          TenantContextStorage: typeof TenantContextStorageType;
        }
      ).TenantContextStorage;
      /* eslint-enable @typescript-eslint/no-require-imports */
    });

    const scopedClient = createTenantScopedPrismaClient();
    await scopedClient.$connect();

    const tenantId = `tenant-rls-audit-${randomUUID()}`;

    const workout = await TenantContextStorage.run({ tenantId }, async () => {
      return scopedClient.workout.create({
        data: {
          title: 'audited under RLS',
          ownerId,
        } as Prisma.WorkoutUncheckedCreateInput,
      });
    });

    await scopedClient.$disconnect();

    const entries = await rawClient.auditLog.findMany({
      where: { tenantId, model: 'Workout', recordId: workout.id },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.operation).toBe('create');
  });
});
