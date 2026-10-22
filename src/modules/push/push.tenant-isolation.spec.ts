import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';
import { createTenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { PushDriver } from '#technical/push/push-driver';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { PushDriverRegistry } from './push-driver.registry';
import { PushService } from './push.service';
import { PushTokenService } from './push.tokens';

describe('tenant isolation', () => {
  const suffix = randomUUID();
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const tokenA = `token-a-${suffix}`;
  const tokenB = `token-b-${suffix}`;
  const raw = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  const reached: string[] = [];
  const driver: PushDriver = {
    send: (token: string) => {
      reached.push(token);
      return Promise.resolve('sent');
    },
  };
  let scoped: TenantScopedPrismaClient;
  let tokens: PushTokenService;
  let push: PushService;
  let userA: string;
  let userB: string;

  async function tokenBStillThere(): Promise<boolean> {
    return (await raw.pushToken.count({ where: { token: tokenB } })) === 1;
  }

  beforeAll(async () => {
    scoped = createTenantScopedPrismaClient();
    tokens = new PushTokenService(scoped);
    push = new PushService({ active: driver } as PushDriverRegistry, tokens);

    userA = (
      await raw.user.create({
        data: { email: `push-a-${suffix}@example.test`, tenantId: tenantA },
      })
    ).id;
    userB = (
      await raw.user.create({
        data: { email: `push-b-${suffix}@example.test`, tenantId: tenantB },
      })
    ).id;
  });

  beforeEach(async () => {
    reached.length = 0;
    await runInTenant(tenantA, () => tokens.register(userA, tokenA, 'web'));
    await runInTenant(tenantB, () => tokens.register(userB, tokenB, 'ios'));
  });

  afterAll(async () => {
    await raw.pushToken.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await raw.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await raw.$disconnect();
    await scoped.$disconnect();
  });

  it('lists the devices of the current tenant only', async () => {
    expect(
      (await runInTenant(tenantA, () => tokens.forUser(userA))).map(
        (device) => device.token,
      ),
    ).toEqual([tokenA]);
    expect(await runInTenant(tenantA, () => tokens.forUser(userB))).toEqual([]);
  });

  it('never sends to a device of another tenant', async () => {
    const delivery = await runInTenant(tenantA, () =>
      push.sendToUser(userB, { title: 'Hi', body: 'there' }),
    );

    expect(delivery).toEqual({ sent: 0, expired: 0, failed: 0 });
    expect(reached).toEqual([]);
  });

  it('cannot forget a device of another tenant', async () => {
    await runInTenant(tenantA, () => tokens.forget([tokenB]));

    expect(await tokenBStillThere()).toBe(true);
  });

  it('sweeps stale devices of the current tenant only', async () => {
    await runInTenant(tenantA, () =>
      tokens.forgetUnseenSince(new Date(Date.now() + 60_000)),
    );

    expect(await tokenBStillThere()).toBe(true);
    expect(await raw.pushToken.count({ where: { token: tokenA } })).toBe(0);
  });

  it('cannot take over a device of another tenant by registering its token', async () => {
    await runInTenant(tenantA, () =>
      tokens.register(userA, tokenB, 'web'),
    ).catch(() => undefined);

    expect(
      await raw.pushToken.findUnique({ where: { token: tokenB } }),
    ).toMatchObject({ tenantId: tenantB, userId: userB, platform: 'ios' });
  });
});
