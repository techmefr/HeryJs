import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#kernel/config/env';
import { createTenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import type { SmsDriver, SmsMessage } from '#kernel/sms/sms-driver';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';
import { SmsConsentService } from './sms.consent';
import { SmsDriverRegistry } from './sms-driver.registry';
import { SmsService } from './sms.service';

describe('tenant isolation', () => {
  const suffix = randomUUID();
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const phone = `+3361${String(Date.now()).slice(-7)}`;
  const raw = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    }),
  });
  const sent: SmsMessage[] = [];
  const driver: SmsDriver = {
    send: (message: SmsMessage) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
  let scoped: TenantScopedPrismaClient;
  let consent: SmsConsentService;
  let sms: SmsService;

  beforeAll(() => {
    scoped = createTenantScopedPrismaClient();
    consent = new SmsConsentService(scoped);
    sms = new SmsService({ active: driver } as SmsDriverRegistry, consent);
  });

  beforeEach(async () => {
    sent.length = 0;
    await raw.smsConsent.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await runInTenant(tenantB, () => consent.grant(phone, 'form'));
  });

  afterAll(async () => {
    await raw.smsConsent.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await raw.$disconnect();
    await scoped.$disconnect();
  });

  it('does not read a consent another tenant recorded for the same number', async () => {
    expect(
      await runInTenant(tenantA, () => consent.decisionFor(phone)),
    ).toEqual({ granted: false });
    expect(
      (await runInTenant(tenantB, () => consent.decisionFor(phone))).granted,
    ).toBe(true);
  });

  it('refuses a marketing text on the strength of another tenant consent', async () => {
    await expect(
      runInTenant(tenantA, () =>
        sms.sendMessage(
          { to: phone, body: 'Sale', sender: 'Shop' },
          { kind: 'marketing', localHour: 12 },
        ),
      ),
    ).rejects.toThrow();
    expect(sent).toEqual([]);
  });

  it('does not revoke another tenant consent', async () => {
    await runInTenant(tenantA, () => consent.revoke(phone, 'reply'));

    expect(
      (await runInTenant(tenantB, () => consent.decisionFor(phone))).granted,
    ).toBe(true);
  });
});
