import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { GENESIS_PREVIOUS_HASH, writeAuditLog } from './audit-log';

/**
 * Reading the chain's tail and appending to it used to be two separate
 * statements with no lock between them: two concurrent writes for the same
 * tenant could both read the same tail and both append a row claiming it as
 * their predecessor -- a fork the linear verifier can never accept.
 */
describe('writeAuditLog concurrency (real database)', () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const client = new PrismaClient({ adapter });

  beforeAll(async () => {
    await client.$connect();
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('serializes two concurrent writes into a single linear chain instead of a fork', async () => {
    const tenantId = `tenant-audit-concurrency-${randomUUID()}`;

    await Promise.all([
      writeAuditLog(client, {
        tenantId,
        model: 'BlogPost',
        operation: 'create',
        recordId: 'record-a',
        data: { title: 'a' },
        userId: null,
        impersonatedBy: null,
      }),
      writeAuditLog(client, {
        tenantId,
        model: 'BlogPost',
        operation: 'create',
        recordId: 'record-b',
        data: { title: 'b' },
        userId: null,
        impersonatedBy: null,
      }),
    ]);

    const entries = await client.auditLog.findMany({
      where: { tenantId },
      orderBy: { sequence: 'asc' },
    });

    expect(entries).toHaveLength(2);
    expect(
      entries.filter((entry) => entry.previousHash === GENESIS_PREVIOUS_HASH),
    ).toHaveLength(1);
    expect(entries[1]?.previousHash).toBe(entries[0]?.hash);
  });

  /**
   * createdAt has millisecond precision, so two entries written in the same
   * millisecond -- which is what the concurrent write above produces -- order
   * arbitrarily. The sequence is what the writer and the verifier both read.
   */
  it('orders the chain by the sequence even when both entries share a timestamp', async () => {
    const tenantId = `tenant-audit-order-${randomUUID()}`;
    const createdAt = new Date();

    for (const recordId of ['record-a', 'record-b']) {
      await writeAuditLog(client, {
        tenantId,
        model: 'BlogPost',
        operation: 'create',
        recordId,
        data: { title: recordId },
        userId: null,
        impersonatedBy: null,
      });
    }

    await client.auditLog.updateMany({
      where: { tenantId },
      data: { createdAt },
    });

    const entries = await client.auditLog.findMany({
      where: { tenantId },
      orderBy: { sequence: 'asc' },
    });

    expect(entries.map((entry) => entry.recordId)).toEqual([
      'record-a',
      'record-b',
    ]);
    expect(entries[1]?.previousHash).toBe(entries[0]?.hash);
  });

  it('refuses a second genesis entry for the same tenant', async () => {
    const tenantId = `tenant-audit-genesis-${randomUUID()}`;

    await writeAuditLog(client, {
      tenantId,
      model: 'BlogPost',
      operation: 'create',
      recordId: 'record-a',
      data: { title: 'a' },
      userId: null,
      impersonatedBy: null,
    });

    await expect(
      client.auditLog.create({
        data: {
          tenantId,
          model: 'BlogPost',
          operation: 'create',
          recordId: 'record-b',
          data: { title: 'b' },
          userId: null,
          impersonatedBy: null,
          hash: 'forged',
          previousHash: GENESIS_PREVIOUS_HASH,
        },
      }),
    ).rejects.toThrow();
  });
});
