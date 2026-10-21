import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { AmbientTransactionStorage } from '#technical/prisma/transaction-context';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { recordTransition, WORKFLOW_TRANSITIONED } from './workflow';

describe('recordTransition (real database)', () => {
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

  const move = (recordId: string, transition: string) =>
    scoped.$atomic(async () => {
      const ambient = AmbientTransactionStorage.current();

      if (!ambient) {
        throw new Error('expected an ambient transaction');
      }

      await recordTransition(ambient.tx, {
        tenantId,
        model: 'Snippet',
        recordId,
        transition,
        from: 'draft',
        to: 'published',
      });
    });

  beforeAll(async () => {
    scoped = createTenantScopedPrismaClient();
    await scoped.$connect();
    const owner = await rawClient.user.create({
      data: { email: `workflow-${randomUUID()}@example.test` },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await rawClient.outboxReceipt.deleteMany({
      where: { message: { tenantId } },
    });
    await rawClient.outboxMessage.deleteMany({ where: { tenantId } });
    await rawClient.auditLog.deleteMany({ where: { tenantId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    await scoped.$disconnect();
  });

  it('leaves one audit entry and one outbox message describing the move', async () => {
    const recordId = `snippet-${randomUUID()}`;

    await inTenant(() => move(recordId, 'publish'));

    const audit = await rawClient.auditLog.findMany({
      where: { tenantId, recordId },
    });
    const messages = await rawClient.outboxMessage.findMany({
      where: { tenantId, payload: { path: ['recordId'], equals: recordId } },
    });

    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      model: 'Snippet',
      operation: 'transition',
      userId: 'actor-1',
    });
    expect(audit[0]?.data).toEqual({
      transition: 'publish',
      from: 'draft',
      to: 'published',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ name: WORKFLOW_TRANSITIONED });
    expect(messages[0]?.payload).toMatchObject({
      model: 'Snippet',
      transition: 'publish',
      from: 'draft',
      to: 'published',
      userId: 'actor-1',
    });
  });

  it('keeps neither record when the transaction fails after writing them', async () => {
    const recordId = `snippet-${randomUUID()}`;

    await expect(
      inTenant(() =>
        scoped.$atomic(async () => {
          const ambient = AmbientTransactionStorage.current();

          await recordTransition(ambient!.tx, {
            tenantId,
            model: 'Snippet',
            recordId,
            transition: 'publish',
            from: 'draft',
            to: 'published',
          });

          throw new Error('the state write failed');
        }),
      ),
    ).rejects.toThrow('the state write failed');

    expect(
      await rawClient.auditLog.count({ where: { tenantId, recordId } }),
    ).toBe(0);
    expect(
      await rawClient.outboxMessage.count({
        where: { tenantId, payload: { path: ['recordId'], equals: recordId } },
      }),
    ).toBe(0);
  });
});
