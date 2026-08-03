import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { writeAuditLog } from './audit-log';

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
        model: 'Workout',
        operation: 'create',
        recordId: 'record-a',
        data: { title: 'a' },
        userId: null,
        impersonatedBy: null,
      }),
      writeAuditLog(client, {
        tenantId,
        model: 'Workout',
        operation: 'create',
        recordId: 'record-b',
        data: { title: 'b' },
        userId: null,
        impersonatedBy: null,
      }),
    ]);

    const entries = await client.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    expect(entries).toHaveLength(2);
    expect(entries.filter((entry) => entry.previousHash === null)).toHaveLength(
      1,
    );
    expect(entries[1]?.previousHash).toBe(entries[0]?.hash);
  });
});
