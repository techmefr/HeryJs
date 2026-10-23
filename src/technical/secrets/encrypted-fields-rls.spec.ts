import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { createTenantScopedPrismaClient as CreateTenantScopedPrismaClient } from '../prisma/prisma.client';
import type { TenantContextStorage as TenantContextStorageType } from '#technical/tenancy/tenant-context';

describe('encrypted columns under row-level security (real database)', () => {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
  });
  const rawClient = new PrismaClient({ adapter });
  let ownerId: string;

  beforeAll(async () => {
    await rawClient.$connect();
    jest.resetModules();

    ownerId = (
      await rawClient.user.create({
        data: { email: `rls-secrets-owner-${randomUUID()}@example.test` },
      })
    ).id;
  });

  afterAll(async () => {
    await rawClient.blogPost.deleteMany({ where: { ownerId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    jest.resetModules();
  });

  it('seals on the transaction branch that bypasses the inner extensions', async () => {
    let createTenantScopedPrismaClient!: typeof CreateTenantScopedPrismaClient;
    let TenantContextStorage!: typeof TenantContextStorageType;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      createTenantScopedPrismaClient = (
        require('../prisma/prisma.client') as {
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
    const tenantId = `tenant-rls-secrets-${randomUUID()}`;

    const created = await TenantContextStorage.run({ tenantId }, async () =>
      scopedClient.blogPost.create({
        data: {
          title: 'sealed under RLS',
          ownerId,
          privateNote: 'rls-secret-value',
        } as Prisma.BlogPostUncheckedCreateInput,
      }),
    );

    const read = await TenantContextStorage.run({ tenantId }, async () =>
      scopedClient.blogPost.findUniqueOrThrow({ where: { id: created.id } }),
    );
    await scopedClient.$disconnect();

    expect(created.privateNote).toBe('rls-secret-value');
    expect(read.privateNote).toBe('rls-secret-value');

    const stored = await rawClient.blogPost.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.privateNote).not.toContain('rls-secret-value');
    expect(stored.privateNote?.startsWith('enc:')).toBe(true);

    const entries = await rawClient.auditLog.findMany({
      where: { tenantId, recordId: created.id },
    });
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0]?.data)).not.toContain('rls-secret-value');

    await rawClient.auditLog.deleteMany({ where: { tenantId } });
  });
});
