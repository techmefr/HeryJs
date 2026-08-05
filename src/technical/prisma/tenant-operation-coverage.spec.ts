import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { createTenantScopedPrismaClient } from './prisma.client';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const rawClient = new PrismaClient({ adapter });

describe('tenant scoping across every Prisma operation', () => {
  const tenantA = `probe-a-${randomUUID()}`;
  const tenantB = `probe-b-${randomUUID()}`;
  const scopedClient = createTenantScopedPrismaClient();

  let ownerId: string;
  let tenantARecordId: string;

  beforeAll(async () => {
    const owner = await rawClient.user.create({
      data: {
        id: randomUUID(),
        email: `probe-${randomUUID()}@heryjs.local`,
        tenantId: tenantA,
      },
    });
    ownerId = owner.id;

    const record = await rawClient.blogPost.create({
      data: { title: 'tenant A secret', ownerId, tenantId: tenantA },
    });
    tenantARecordId = record.id;
  });

  afterAll(async () => {
    await rawClient.blogPost.deleteMany({ where: { ownerId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
  });

  // A Prisma promise does its work when awaited, so the await has to happen
  // inside the context: returning the promise out of run() loses it.
  const asTenantB = <T>(run: () => Promise<T>): Promise<T> =>
    TenantContextStorage.run({ tenantId: tenantB }, async () => await run());

  it('does not let findUniqueOrThrow read another tenant record', async () => {
    await expect(
      asTenantB(() =>
        scopedClient.blogPost.findUniqueOrThrow({
          where: { id: tenantARecordId },
        }),
      ),
    ).rejects.toThrow();
  });

  it('does not let aggregate count another tenant rows', async () => {
    const result = await asTenantB(() =>
      scopedClient.blogPost.aggregate({ _count: { _all: true } }),
    );

    expect(result._count._all).toBe(0);
  });

  it('does not let groupBy see another tenant rows', async () => {
    const groups = await asTenantB(() =>
      scopedClient.blogPost.groupBy({
        by: ['tenantId'],
        _count: { _all: true },
      }),
    );

    expect(groups.map((group) => group.tenantId)).not.toContain(tenantA);
  });

  it('does not let upsert take over another tenant record', async () => {
    await asTenantB(() =>
      scopedClient.blogPost.upsert({
        where: { id: tenantARecordId },
        update: { title: 'stolen by tenant B' },
        // tenantId is stamped by the extension, so callers never pass it.
        create: { title: 'created by tenant B', ownerId } as unknown as Omit<
          Prisma.BlogPostCreateInput,
          'owner'
        > & { ownerId: string },
      }),
    );

    const stored = await rawClient.blogPost.findUnique({
      where: { id: tenantARecordId },
    });

    expect(stored?.title).toBe('tenant A secret');
  });
});
