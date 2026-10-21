import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { DatabaseLogDriver } from './database-log.driver';
import { LogPipeline } from './log.pipeline';
import { tenantLogMixin } from './tenant-log-mixin';
import type { LogDriver } from './log-driver';

const FIRST_PAGE = { page: 1, limit: 100, skip: 0, take: 100 };
const NO_FILTER = { level: null, from: null, to: null, text: null } as const;

describe('a line from the real logger to the persisted store', () => {
  let prisma: TenantScopedPrismaClient;
  const tenants: string[] = [];

  beforeAll(async () => {
    prisma = createTenantScopedPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.logEntry.deleteMany({
      where: {
        tenantId: { in: [...tenants, 'system'] },
        message: { startsWith: 'it-spec' },
      },
    });
    await prisma.$disconnect();
  });

  it('stamps the tenant from the ambient context and stores it under that tenant', async () => {
    const tenantId = `log-spec-${randomUUID()}`;
    tenants.push(tenantId);
    const store = new DatabaseLogDriver(prisma);
    const stdout: string[] = [];
    const console: LogDriver = {
      write: (entry) => void stdout.push(entry.raw),
    };
    const pipeline = new LogPipeline(console);
    pipeline.attach([console, store]);
    const logger = pino(
      { level: 'info', mixin: tenantLogMixin },
      {
        write: (line: string) => pipeline.write(line),
      },
    );

    TenantContextStorage.run({ tenantId }, () => {
      logger.warn({ orderId: 7 }, 'it-spec inside a request');
    });
    logger.info('it-spec outside any request');

    await store.flush();

    const mine = await store.query(tenantId, NO_FILTER, FIRST_PAGE);

    expect(mine.records.map((record) => record.message)).toEqual([
      'it-spec inside a request',
    ]);
    expect(mine.records[0]).toMatchObject({
      level: 'warn',
      fields: { orderId: 7 },
    });
    expect(stdout).toHaveLength(2);

    const system = await prisma.logEntry.findMany({
      where: { tenantId: 'system', message: 'it-spec outside any request' },
    });

    expect(system.length).toBeGreaterThanOrEqual(1);
  });
});
