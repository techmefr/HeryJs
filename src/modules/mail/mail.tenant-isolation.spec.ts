import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';
import type { JobsService } from '#technical/jobs/jobs.service';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

describe('tenant isolation', () => {
  const suffix = randomUUID();
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const raw = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  const dispatched: Array<{ tenantId?: string; to: string }> = [];
  const jobs = {
    dispatch: (_name: string, data: { tenantId?: string; to: string }) => {
      dispatched.push(data);
      return Promise.resolve();
    },
  } as unknown as JobsService;
  let scoped: TenantScopedPrismaClient;
  let mail: MailService;
  let controller: MailController;

  beforeAll(async () => {
    scoped = createTenantScopedPrismaClient();
    mail = new MailService(jobs, scoped);
    controller = new MailController(mail);

    await runInTenant(tenantA, () =>
      mail.queue(`a-${suffix}@example.test`, 'welcome', { name: 'A' }),
    );
    await runInTenant(tenantB, () =>
      mail.queue(`b-${suffix}@example.test`, 'welcome', { name: 'B' }),
    );
  });

  afterAll(async () => {
    await raw.mailLog.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await raw.$disconnect();
    await scoped.$disconnect();
  });

  it('stamps each queued mail and its job with the tenant that queued it', async () => {
    expect(dispatched).toEqual([
      expect.objectContaining({
        tenantId: tenantA,
        to: `a-${suffix}@example.test`,
      }),
      expect.objectContaining({
        tenantId: tenantB,
        to: `b-${suffix}@example.test`,
      }),
    ]);
    expect(
      await raw.mailLog.findMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
        select: { tenantId: true, to: true },
        orderBy: { to: 'asc' },
      }),
    ).toEqual([
      { tenantId: tenantA, to: `a-${suffix}@example.test` },
      { tenantId: tenantB, to: `b-${suffix}@example.test` },
    ]);
  });

  it('lists the mail log of the current tenant only', async () => {
    const page = (await runInTenant(tenantA, () => controller.list({}))) as {
      data: Array<{ to: string; tenantId: string }>;
    };

    expect(page.data.map((log) => log.to)).toEqual([
      `a-${suffix}@example.test`,
    ]);
  });
});
