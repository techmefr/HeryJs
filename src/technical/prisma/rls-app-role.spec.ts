import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { heryConfig } from '../config/hery-config';
import {
  ROW_LEVEL_SECURITY_DISABLED_WARNING,
  rowLevelSecurityEnabled,
  warnWhenRowLevelSecurityDisabled,
} from './row-level-security';

describe('row-level security for the role the app connects as (real database)', () => {
  const ownerClient = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    }),
  });
  const appClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  const otherTenant = `tenant-rls-app-${randomUUID()}`;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await ownerClient.user.create({
      data: { email: `rls-app-${randomUUID()}@example.test` },
    });
    ownerId = owner.id;

    await ownerClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherTenant}, true)`;
      await tx.blogPost.create({
        data: { title: 'other tenant', ownerId, tenantId: otherTenant },
      });
    });
  });

  afterAll(async () => {
    await ownerClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherTenant}, true)`;
      await tx.blogPost.deleteMany({ where: { ownerId } });
    });
    await ownerClient.user.delete({ where: { id: ownerId } });
    await ownerClient.$disconnect();
    await appClient.$disconnect();
  });

  it('is on by default in hery.config.ts', () => {
    expect(rowLevelSecurityEnabled(heryConfig)).toBe(true);
  });

  it('connects as a role that is neither superuser nor BYPASSRLS', async () => {
    const [role] = await appClient.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('shows a raw query without a tenant context no row of another tenant', async () => {
    const rows = await appClient.$queryRaw<{ id: string }[]>`
      SELECT id FROM "BlogPost" WHERE "tenantId" = ${otherTenant}`;

    expect(rows).toEqual([]);
  });
});

describe('turning row-level security off', () => {
  it('takes database.rowLevelSecurity: false and warns about it', () => {
    const warn = jest.fn();

    expect(
      warnWhenRowLevelSecurityDisabled(
        { database: { rowLevelSecurity: false } },
        warn,
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalledWith(ROW_LEVEL_SECURITY_DISABLED_WARNING);
  });

  it('stays on and silent when the option is absent', () => {
    const warn = jest.fn();

    expect(warnWhenRowLevelSecurityDisabled({}, warn)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
