import { randomUUID } from 'node:crypto';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { DatabaseLogDriver } from './database-log.driver';
import { parseLogLine } from './log-line';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_PAGE = { page: 1, limit: 100, skip: 0, take: 100 };
const NO_FILTER = { level: null, from: null, to: null, text: null } as const;

function entry(
  tenantId: string | null,
  message: string,
  overrides: { level?: number; time?: number; extra?: object } = {},
) {
  return parseLogLine(
    JSON.stringify({
      level: overrides.level ?? 30,
      time: overrides.time ?? Date.now(),
      msg: message,
      ...(tenantId === null ? {} : { tenantId }),
      ...overrides.extra,
    }),
  );
}

describe('DatabaseLogDriver', () => {
  let prisma: TenantScopedPrismaClient;
  let driver: DatabaseLogDriver;
  const tenants: string[] = [];

  function freshTenant(): string {
    const tenantId = `db-log-${randomUUID()}`;
    tenants.push(tenantId);

    return tenantId;
  }

  beforeAll(async () => {
    prisma = createTenantScopedPrismaClient();
    await prisma.$connect();
    driver = new DatabaseLogDriver(prisma);
  });

  afterAll(async () => {
    await prisma.logEntry.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.$disconnect();
  });

  it('answers only for the tenant it is asked about, newest first', async () => {
    const mine = freshTenant();
    const theirs = freshTenant();
    const now = Date.now();

    driver.write(entry(mine, 'old', { time: now - 1000 }));
    driver.write(entry(mine, 'new', { time: now }));
    driver.write(entry(theirs, 'foreign'));
    await driver.flush();

    const { records, total } = await driver.query(mine, NO_FILTER, FIRST_PAGE);

    expect(total).toBe(2);
    expect(records.map((record) => record.message)).toEqual(['new', 'old']);
  });

  it('files a line with no tenant under system', async () => {
    const message = `orphan ${randomUUID()}`;

    driver.write(entry(null, message));
    await driver.flush();

    const rows = await prisma.logEntry.findMany({ where: { message } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe('system');

    await prisma.logEntry.deleteMany({ where: { message } });
  });

  it('filters by level, time range and message text', async () => {
    const tenantId = freshTenant();
    const now = Date.now();

    driver.write(
      entry(tenantId, 'Payment failed', { level: 50, time: now - 3 * DAY_MS }),
    );
    driver.write(
      entry(tenantId, 'payment ok', { level: 30, time: now - 2 * DAY_MS }),
    );
    driver.write(
      entry(tenantId, 'payment failed again', { level: 50, time: now }),
    );
    await driver.flush();

    const byLevel = await driver.query(
      tenantId,
      { ...NO_FILTER, level: 'error' },
      FIRST_PAGE,
    );
    const byText = await driver.query(
      tenantId,
      { ...NO_FILTER, text: 'PAYMENT FAILED' },
      FIRST_PAGE,
    );
    const byRange = await driver.query(
      tenantId,
      {
        ...NO_FILTER,
        from: new Date(now - 2.5 * DAY_MS),
        to: new Date(now - DAY_MS),
      },
      FIRST_PAGE,
    );

    expect(byLevel.total).toBe(2);
    expect(byText.total).toBe(2);
    expect(byRange.records.map((record) => record.message)).toEqual([
      'payment ok',
    ]);
  });

  it('pages', async () => {
    const tenantId = freshTenant();

    for (let index = 0; index < 5; index += 1) {
      driver.write(
        entry(tenantId, `line ${index}`, { time: Date.now() + index }),
      );
    }

    await driver.flush();

    const second = await driver.query(tenantId, NO_FILTER, {
      page: 2,
      limit: 2,
      skip: 2,
      take: 2,
    });

    expect(second.total).toBe(5);
    expect(second.records.map((record) => record.message)).toEqual([
      'line 2',
      'line 1',
    ]);
  });

  it('stores a marker instead of an oversized payload', async () => {
    const tenantId = freshTenant();

    driver.write(
      entry(tenantId, 'big', { extra: { blob: 'x'.repeat(20_000) } }),
    );
    await driver.flush();

    const { records } = await driver.query(tenantId, NO_FILTER, FIRST_PAGE);

    expect(records[0]?.fields).toEqual({ truncated: true });
  });

  it('prunes past the retention window', async () => {
    const tenantId = freshTenant();

    driver.write(entry(tenantId, 'stale', { time: Date.now() - 10 * DAY_MS }));
    driver.write(entry(tenantId, 'fresh'));
    await driver.flush();

    await driver.prune({ retentionDays: 7, maxEntriesPerTenant: 1000 });

    const { records } = await driver.query(tenantId, NO_FILTER, FIRST_PAGE);

    expect(records.map((record) => record.message)).toEqual(['fresh']);
  });

  it('caps a chatty tenant without touching a quiet one', async () => {
    const noisy = freshTenant();
    const quiet = freshTenant();
    const now = Date.now();

    for (let index = 0; index < 6; index += 1) {
      driver.write(
        entry(noisy, `n${index}`, { time: now - (6 - index) * 1000 }),
      );
    }

    driver.write(entry(quiet, 'q0'));
    await driver.flush();

    await driver.prune({ retentionDays: 7, maxEntriesPerTenant: 3 });

    const kept = await driver.query(noisy, NO_FILTER, FIRST_PAGE);

    expect(kept.records.map((record) => record.message)).toEqual([
      'n5',
      'n4',
      'n3',
    ]);
    expect((await driver.query(quiet, NO_FILTER, FIRST_PAGE)).total).toBe(1);
  });
});
