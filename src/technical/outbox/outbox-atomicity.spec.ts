import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { runInTenant } from '#technical/tenancy/run-in-tenant';

type BlogPostInput = Omit<Prisma.BlogPostUncheckedCreateInput, 'tenantId'>;

describe('outbox written by the tenant-scoped client (real database)', () => {
  const rawClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const tenantId = `tenant-${randomUUID()}`;
  let scoped: TenantScopedPrismaClient;
  let ownerId: string;

  const inTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    runInTenant(
      tenantId,
      async () => {
        const result = await fn();
        return result;
      },
      { userId: 'actor-1' },
    );

  const createPost = (data: BlogPostInput) =>
    inTenant(() =>
      scoped.blogPost.create({
        data: data as Prisma.BlogPostUncheckedCreateInput,
      }),
    );

  const messagesFor = (recordId: string) =>
    rawClient.outboxMessage.findMany({
      where: { tenantId, payload: { path: ['recordId'], equals: recordId } },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    scoped = createTenantScopedPrismaClient();
    await scoped.$connect();
    const owner = await rawClient.user.create({
      data: { email: `outbox-${randomUUID()}@example.test` },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await rawClient.blogPost.deleteMany({ where: { tenantId } });
    await rawClient.outboxReceipt.deleteMany({
      where: { message: { tenantId } },
    });
    await rawClient.outboxMessage.deleteMany({ where: { tenantId } });
    await rawClient.auditLog.deleteMany({ where: { tenantId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    await scoped.$disconnect();
  });

  it('commits a model.created message with the row it describes', async () => {
    const post = await createPost({ title: 'first', ownerId });
    const [message] = await messagesFor(post.id);

    expect(message).toMatchObject({
      name: 'model.created',
      tenantId,
    });
    expect(message?.payload).toMatchObject({
      model: 'BlogPost',
      kind: 'created',
      recordId: post.id,
      userId: 'actor-1',
    });
  });

  it('leaves no message behind when the write itself fails', async () => {
    const before = await rawClient.outboxMessage.count({ where: { tenantId } });

    await expect(
      createPost({ title: 'orphan', ownerId: `missing-${randomUUID()}` }),
    ).rejects.toThrow();

    expect(await rawClient.outboxMessage.count({ where: { tenantId } })).toBe(
      before,
    );
  });

  it('rolls the write back when the message cannot be staged', async () => {
    const before = await rawClient.blogPost.count({ where: { tenantId } });
    const suffix = tenantId.replace(/-/g, '_');

    await rawClient.$executeRawUnsafe(
      `CREATE FUNCTION outbox_refuse_${suffix}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'outbox down'; END; $$ LANGUAGE plpgsql`,
    );
    await rawClient.$executeRawUnsafe(
      `CREATE TRIGGER outbox_refuse_${suffix} BEFORE INSERT ON "OutboxMessage" FOR EACH ROW WHEN (NEW."tenantId" = '${tenantId}') EXECUTE FUNCTION outbox_refuse_${suffix}()`,
    );

    try {
      await expect(createPost({ title: 'doomed', ownerId })).rejects.toThrow(
        'outbox down',
      );
    } finally {
      await rawClient.$executeRawUnsafe(
        `DROP TRIGGER outbox_refuse_${suffix} ON "OutboxMessage"`,
      );
      await rawClient.$executeRawUnsafe(
        `DROP FUNCTION outbox_refuse_${suffix}()`,
      );
    }

    expect(await rawClient.blogPost.count({ where: { tenantId } })).toBe(
      before,
    );
  });

  it('announces an update with the fields it touched, and a soft delete as a deletion', async () => {
    const post = await createPost({ title: 'edit me', ownerId });

    await inTenant(() =>
      scoped.blogPost.update({
        where: { id: post.id },
        data: { title: 'edited' },
      }),
    );
    await inTenant(() =>
      scoped.blogPost.update({
        where: { id: post.id },
        data: { deletedAt: new Date() },
      }),
    );

    const messages = await messagesFor(post.id);

    expect(messages.map((message) => message.name)).toEqual([
      'model.created',
      'model.updated',
      'model.deleted',
    ]);
    expect(messages[1]?.payload).toMatchObject({ changedFields: ['title'] });
  });

  it('announces a hard delete', async () => {
    const post = await createPost({ title: 'remove me', ownerId });

    await inTenant(() => scoped.blogPost.delete({ where: { id: post.id } }));

    const names = (await messagesFor(post.id)).map((message) => message.name);

    expect(names).toEqual(['model.created', 'model.deleted']);
  });

  it('does not stage anything for a read', async () => {
    const post = await createPost({ title: 'read me', ownerId });
    const before = (await messagesFor(post.id)).length;

    await inTenant(() => scoped.blogPost.findMany({ where: { id: post.id } }));

    expect((await messagesFor(post.id)).length).toBe(before);
  });
});
