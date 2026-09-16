import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  createTenantScopedPrismaClient,
  TenantScopedPrismaClient,
} from './prisma.client';

type BlogPostInputWithoutTenantId = Omit<
  Prisma.BlogPostUncheckedCreateInput,
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
  const createBlogPost = (data: BlogPostInputWithoutTenantId) =>
    scopedClient.blogPost.create({
      data: data as Prisma.BlogPostUncheckedCreateInput,
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
    await rawClient.blogPost.deleteMany({ where: { ownerId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    await scopedClient.$disconnect();
  });

  /**
   * The leak this closes: an included relation is fetched by the same query as
   * its parent, so the extension -- which intercepts the top-level operation
   * only -- never filtered it. A note written into tenant B and hung off a
   * post tenant A can reach came back verbatim inside A's payload.
   */
  it('filters an included relation by tenant, not only the row that owns it', async () => {
    const post = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () => createBlogPost({ title: 'shared post', ownerId }),
    );

    await rawClient.blogPostNote.create({
      data: {
        tenantId: tenantB,
        blogPostId: post.id,
        body: 'belongs to tenant B',
      },
    });
    await rawClient.blogPostNote.create({
      data: {
        tenantId: tenantA,
        blogPostId: post.id,
        body: 'belongs to tenant A',
      },
    });

    const read = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () =>
        scopedClient.blogPost.findFirst({
          where: { id: post.id },
          include: { notes: true },
        }),
    );

    expect(read?.notes.map((note) => note.body)).toEqual([
      'belongs to tenant A',
    ]);

    await rawClient.blogPostNote.deleteMany({ where: { blogPostId: post.id } });
    await rawClient.blogPost.delete({ where: { id: post.id } });
  });

  // A count of another tenant's rows discloses their existence as surely as
  // returning them, so _count is rewritten too.
  it('counts only the current tenant rows through _count', async () => {
    const post = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () => createBlogPost({ title: 'counted post', ownerId }),
    );

    await rawClient.blogPostNote.createMany({
      data: [
        { tenantId: tenantB, blogPostId: post.id, body: 'B one' },
        { tenantId: tenantB, blogPostId: post.id, body: 'B two' },
        { tenantId: tenantA, blogPostId: post.id, body: 'A one' },
      ],
    });

    const read = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () =>
        scopedClient.blogPost.findFirst({
          where: { id: post.id },
          select: { id: true, _count: { select: { notes: true } } },
        }),
    );

    expect(read?._count.notes).toBe(1);

    await rawClient.blogPostNote.deleteMany({ where: { blogPostId: post.id } });
    await rawClient.blogPost.delete({ where: { id: post.id } });
  });

  it('injects the current tenant id on create without the caller passing it', async () => {
    await TenantContextStorage.run({ tenantId: tenantA }, async () => {
      await createBlogPost({ title: 'from tenant A', ownerId });
    });

    const stored = await rawClient.blogPost.findMany({ where: { ownerId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tenantId).toBe(tenantA);
  });

  it('never lets tenant B read a record created under tenant A', async () => {
    await TenantContextStorage.run({ tenantId: tenantA }, async () => {
      await createBlogPost({ title: 'still tenant A', ownerId });
    });
    await TenantContextStorage.run({ tenantId: tenantB }, async () => {
      await createBlogPost({ title: 'tenant B', ownerId });
    });

    const asTenantA = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () => {
        return await scopedClient.blogPost.findMany({});
      },
    );
    const asTenantB = await TenantContextStorage.run(
      { tenantId: tenantB },
      async () => {
        return await scopedClient.blogPost.findMany({});
      },
    );

    expect(asTenantA.every((blogPost) => blogPost.tenantId === tenantA)).toBe(
      true,
    );
    expect(asTenantB.every((blogPost) => blogPost.tenantId === tenantB)).toBe(
      true,
    );
    expect(asTenantA).toHaveLength(2);
    expect(asTenantB).toHaveLength(1);
  });
});
