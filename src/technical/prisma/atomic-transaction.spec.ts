import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  createTenantScopedPrismaClient,
  TenantScopedPrismaClient,
} from './prisma.client';
import { AmbientTransactionStorage } from './transaction-context';

describe('$atomic on the tenant-scoped client (real database)', () => {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
  });
  const rawClient = new PrismaClient({ adapter });
  let scopedClient: TenantScopedPrismaClient;
  let ownerId: string;
  const tenantId = `tenant-atomic-${randomUUID()}`;

  const inTenant = <T>(callback: () => Promise<T>): Promise<T> =>
    TenantContextStorage.run({ tenantId }, callback);

  const createPost = (title: string) =>
    scopedClient.blogPost.create({
      data: { title, ownerId } as Prisma.BlogPostUncheckedCreateInput,
    });

  beforeAll(async () => {
    await rawClient.$connect();
    scopedClient = createTenantScopedPrismaClient();
    await scopedClient.$connect();

    const owner = await rawClient.user.create({
      data: { email: `atomic-owner-${randomUUID()}@example.test` },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await rawClient.blogPost.deleteMany({ where: { ownerId } });
    await rawClient.auditLog.deleteMany({ where: { tenantId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await scopedClient.$disconnect();
    await rawClient.$disconnect();
  });

  it('commits every write and its audit entry together, then runs the after-commit callbacks', async () => {
    const order: string[] = [];

    await inTenant(() =>
      scopedClient.$atomic(async () => {
        await createPost('atomic-one');
        await createPost('atomic-two');
        await AmbientTransactionStorage.afterCommit(() => {
          order.push('after-commit');
        });
        order.push('callback-done');
      }),
    );

    expect(order).toEqual(['callback-done', 'after-commit']);
    expect(
      await rawClient.blogPost.count({
        where: { ownerId, title: { in: ['atomic-one', 'atomic-two'] } },
      }),
    ).toBe(2);
    expect(
      await rawClient.auditLog.count({
        where: { tenantId, model: 'BlogPost', operation: 'create' },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('leaves nothing behind when the callback throws: no rows, no audit entries, no after-commit callbacks', async () => {
    const afterCommit = jest.fn();
    let rolledBackId = '';

    await expect(
      inTenant(() =>
        scopedClient.$atomic(async () => {
          rolledBackId = (await createPost('rolled-back')).id;
          await AmbientTransactionStorage.afterCommit(afterCommit);
          throw new Error('the second write failed');
        }),
      ),
    ).rejects.toThrow('the second write failed');

    expect(
      await rawClient.blogPost.count({
        where: { ownerId, title: 'rolled-back' },
      }),
    ).toBe(0);
    expect(rolledBackId).not.toBe('');
    expect(
      await rawClient.auditLog.count({ where: { recordId: rolledBackId } }),
    ).toBe(0);
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('joins an enclosing atomic block instead of committing on its own', async () => {
    await expect(
      inTenant(() =>
        scopedClient.$atomic(async () => {
          await scopedClient.$atomic(() => createPost('nested'));
          throw new Error('outer failed');
        }),
      ),
    ).rejects.toThrow('outer failed');

    expect(
      await rawClient.blogPost.count({ where: { ownerId, title: 'nested' } }),
    ).toBe(0);
  });

  it('runs a callback straight away when no transaction is open', async () => {
    const callback = jest.fn();

    await AmbientTransactionStorage.afterCommit(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps a failing after-commit callback from failing a committed batch', async () => {
    await expect(
      inTenant(() =>
        scopedClient.$atomic(async () => {
          await AmbientTransactionStorage.afterCommit(() => {
            throw new Error('index is down');
          });
          return createPost('survives-side-effect');
        }),
      ),
    ).resolves.toMatchObject({ title: 'survives-side-effect' });
  });
});
