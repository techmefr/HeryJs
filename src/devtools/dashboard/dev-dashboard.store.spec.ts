import { randomUUID } from 'node:crypto';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { DevDashboardStore } from './dev-dashboard.store';
import type { NewDevDashboardEntry } from './dev-dashboard.types';

const HOUR_MS = 60 * 60 * 1000;
const FIRST_PAGE = { page: 1, limit: 100, skip: 0, take: 100 };
const NO_FILTER = { kind: null, minDurationMs: null };

function entry(
  tenantId: string,
  overrides: Partial<NewDevDashboardEntry> = {},
): NewDevDashboardEntry {
  return {
    tenantId,
    kind: 'request',
    label: 'GET /tags',
    status: '200',
    durationMs: 10,
    requestId: null,
    detail: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('DevDashboardStore', () => {
  let prisma: TenantScopedPrismaClient;
  let store: DevDashboardStore;
  const tenants: string[] = [];

  function freshTenant(): string {
    const tenantId = `store-spec-${randomUUID()}`;
    tenants.push(tenantId);

    return tenantId;
  }

  beforeAll(async () => {
    prisma = createTenantScopedPrismaClient();
    await prisma.$connect();
    store = new DevDashboardStore(prisma);
  });

  afterAll(async () => {
    await prisma.devtoolsEntry.deleteMany({
      where: { tenantId: { in: tenants } },
    });
    await prisma.$disconnect();
  });

  it('lists only the tenant it is asked for, newest first', async () => {
    const mine = freshTenant();
    const theirs = freshTenant();
    const now = Date.now();

    await store.insertMany([
      entry(mine, { label: 'old', createdAt: new Date(now - 1000) }),
      entry(mine, { label: 'new', createdAt: new Date(now) }),
      entry(theirs, { label: 'foreign' }),
    ]);

    const { records, total } = await store.list(mine, NO_FILTER, FIRST_PAGE);

    expect(total).toBe(2);
    expect(records.map((record) => record.label)).toEqual(['new', 'old']);
  });

  it('filters by kind and by minimum duration', async () => {
    const tenantId = freshTenant();

    await store.insertMany([
      entry(tenantId, { kind: 'slow-query', durationMs: 500, label: 'slow' }),
      entry(tenantId, { kind: 'slow-query', durationMs: 150, label: 'less' }),
      entry(tenantId, { kind: 'request', durationMs: 900 }),
    ]);

    const { records } = await store.list(
      tenantId,
      { kind: 'slow-query', minDurationMs: 200 },
      FIRST_PAGE,
    );

    expect(records.map((record) => record.label)).toEqual(['slow']);
  });

  it('counts every kind, zero included', async () => {
    const tenantId = freshTenant();

    await store.insertMany([
      entry(tenantId),
      entry(tenantId),
      entry(tenantId, { kind: 'exception' }),
    ]);

    expect(await store.summary(tenantId)).toMatchObject({
      request: 2,
      exception: 1,
      job: 0,
    });
  });

  it('clears one tenant and leaves the others', async () => {
    const mine = freshTenant();
    const theirs = freshTenant();

    await store.insertMany([entry(mine), entry(theirs)]);

    expect(await store.clear(mine)).toBe(1);
    expect((await store.list(theirs, NO_FILTER, FIRST_PAGE)).total).toBe(1);
  });

  it('prunes past the retention window', async () => {
    const tenantId = freshTenant();

    await store.insertMany([
      entry(tenantId, {
        label: 'stale',
        createdAt: new Date(Date.now() - 48 * HOUR_MS),
      }),
      entry(tenantId, { label: 'fresh' }),
    ]);

    await store.prune({ retentionHours: 24, maxEntriesPerTenant: 1000 });

    const { records } = await store.list(tenantId, NO_FILTER, FIRST_PAGE);

    expect(records.map((record) => record.label)).toEqual(['fresh']);
  });

  it('caps a noisy tenant without touching a quiet one', async () => {
    const noisy = freshTenant();
    const quiet = freshTenant();
    const now = Date.now();

    await store.insertMany([
      ...Array.from({ length: 6 }, (_, index) =>
        entry(noisy, {
          label: `n${index}`,
          createdAt: new Date(now - (6 - index) * 1000),
        }),
      ),
      entry(quiet, { label: 'q0' }),
    ]);

    await store.prune({ retentionHours: 24, maxEntriesPerTenant: 3 });

    const kept = await store.list(noisy, NO_FILTER, FIRST_PAGE);

    expect(kept.records.map((record) => record.label)).toEqual([
      'n5',
      'n4',
      'n3',
    ]);
    expect((await store.list(quiet, NO_FILTER, FIRST_PAGE)).total).toBe(1);
  });
});
