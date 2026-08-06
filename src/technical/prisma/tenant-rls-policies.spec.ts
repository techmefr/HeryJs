import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { modelSetIn } from '../../../cli/lib/rls';

/**
 * lint:rls proves the migration exists. This proves the database it produced
 * actually carries the policy: a migration whose SQL was edited, reverted or
 * never applied would pass the first check and fail this one.
 */
describe('tenant isolation policies (real database)', () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const governed = modelSetIn(
    readFileSync(path.join(__dirname, 'prisma.client.ts'), 'utf8'),
    'TENANT_SCOPED_MODELS',
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has a tenant_isolation policy on every tenant-scoped table', async () => {
    const rows = await prisma.$queryRaw<
      { tablename: string; policyname: string }[]
    >`SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'`;

    const withPolicy = new Set(
      rows
        .filter((row) => row.policyname === 'tenant_isolation')
        .map((row) => row.tablename),
    );

    expect(governed.length).toBeGreaterThan(0);
    expect(governed.filter((model) => !withPolicy.has(model))).toEqual([]);
  });

  it('forces the policy on the table owner too, which the app connects as', async () => {
    const rows = await prisma.$queryRaw<
      { relname: string; relforcerowsecurity: boolean }[]
    >`SELECT relname, relforcerowsecurity FROM pg_class WHERE relname = ANY(${governed})`;

    expect(rows.filter((row) => !row.relforcerowsecurity)).toEqual([]);
  });
});
