import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { LockService } from '#technical/lock/lock.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_DEAD_RETENTION_DAYS,
  OUTBOX_DELIVERED_RETENTION_DAYS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RELAY_LOCK,
  OUTBOX_STATUS_DEAD,
  OUTBOX_STATUS_DELIVERED,
  OUTBOX_STATUS_PENDING,
} from './outbox.constants';
import { OutboxModule } from './outbox.module';
import { OutboxRegistry } from './outbox.registry';
import { OutboxRelay, outboxBackoffMs } from './outbox.relay';
import { OUTBOX_RELAY_OPTIONS } from './outbox.runner';
import type { OutboxRelayOptions } from './outbox.runner';
import { OutboxService } from './outbox.service';
import type { OutboxDelivery } from './outbox.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('OutboxRelay (real database)', () => {
  const locks = new LockService();
  const outbox = new OutboxService();
  const created: string[] = [];
  let registry: OutboxRegistry;
  let relay: OutboxRelay;

  const messageName = () => `spec.${randomUUID()}`;

  const stage = async (
    name: string,
    tenantId: string | null = null,
  ): Promise<string> => {
    const message = await authPrismaClient.outboxMessage.create({
      data: { name, tenantId, payload: { hello: 'world' } },
    });
    created.push(message.id);
    return message.id;
  };

  const reload = (id: string) =>
    authPrismaClient.outboxMessage.findUniqueOrThrow({ where: { id } });

  const makeDue = (id: string) =>
    authPrismaClient.outboxMessage.update({
      where: { id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

  beforeEach(async () => {
    registry = new OutboxRegistry();
    relay = new OutboxRelay(registry, locks);
    await authPrismaClient.outboxMessage.updateMany({
      where: { status: OUTBOX_STATUS_PENDING, id: { notIn: created } },
      data: { status: OUTBOX_STATUS_DELIVERED, deliveredAt: new Date() },
    });
  });

  afterAll(async () => {
    await authPrismaClient.outboxReceipt.deleteMany({
      where: { messageId: { in: created } },
    });
    await authPrismaClient.outboxMessage.deleteMany({
      where: { id: { in: created } },
    });
    await locks.onModuleDestroy();
  });

  it('hands a pending message to the handler registered for it and marks it delivered', async () => {
    const name = messageName();
    const id = await stage(name);
    const seen: OutboxDelivery[] = [];

    registry.register({
      name: 'collector',
      names: [name],
      handle: (delivery) => {
        seen.push(delivery);
      },
    });

    await relay.drain();

    const message = await reload(id);

    expect(message.status).toBe(OUTBOX_STATUS_DELIVERED);
    expect(message.deliveredAt).not.toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id,
      name,
      attempt: 1,
      payload: { hello: 'world' },
    });
  });

  it('matches handlers by exact name, trailing wildcard or catch-all', async () => {
    const prefix = `family.${randomUUID()}`;
    const id = await stage(`${prefix}.created`);
    const hits: string[] = [];

    for (const [handlerName, pattern] of [
      ['exact', `${prefix}.created`],
      ['family', `${prefix}.*`],
      ['everything', '*'],
      ['other', `${prefix}.deleted`],
    ] as const) {
      registry.register({
        name: handlerName,
        names: [pattern],
        handle: (delivery) => {
          if (delivery.id === id) {
            hits.push(handlerName);
          }
        },
      });
    }

    await relay.drain();

    expect(hits.sort()).toEqual(['everything', 'exact', 'family']);
    expect((await reload(id)).status).toBe(OUTBOX_STATUS_DELIVERED);
  });

  it('marks a message nobody listens to as delivered instead of keeping it forever', async () => {
    const id = await stage(messageName());

    await relay.drain();

    expect((await reload(id)).status).toBe(OUTBOX_STATUS_DELIVERED);
  });

  it('reopens the tenant the message was written under around the handler', async () => {
    const name = messageName();
    const tenantId = `tenant-${randomUUID()}`;
    await stage(name, tenantId);
    let seenTenant: string | null = null;

    registry.register({
      name: 'tenant-aware',
      names: [name],
      handle: () => {
        seenTenant = TenantContextStorage.getTenantId();
      },
    });

    await relay.drain();

    expect(seenTenant).toBe(tenantId);
  });

  it('retries a failing message with a growing backoff and records why', async () => {
    const name = messageName();
    const id = await stage(name);

    registry.register({
      name: 'flaky',
      names: [name],
      handle: () => {
        throw new Error('smtp is down');
      },
    });

    const before = Date.now();
    await relay.drain();
    const first = await reload(id);

    expect(first.status).toBe(OUTBOX_STATUS_PENDING);
    expect(first.attempts).toBe(1);
    expect(first.lastError).toContain('flaky: smtp is down');
    expect(first.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + OUTBOX_BACKOFF_BASE_MS,
    );

    await relay.drain();
    expect((await reload(id)).attempts).toBe(1);

    await makeDue(id);
    const beforeSecond = Date.now();
    await relay.drain();
    const second = await reload(id);

    expect(second.attempts).toBe(2);
    expect(second.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      beforeSecond + OUTBOX_BACKOFF_BASE_MS * 2,
    );
  });

  it('delivers once the failure clears', async () => {
    const name = messageName();
    const id = await stage(name);
    let isFailing = true;

    registry.register({
      name: 'recovering',
      names: [name],
      handle: () => {
        if (isFailing) {
          throw new Error('not yet');
        }
      },
    });

    await relay.drain();
    isFailing = false;
    await makeDue(id);
    await relay.drain();

    const message = await reload(id);

    expect(message.status).toBe(OUTBOX_STATUS_DELIVERED);
    expect(message.attempts).toBe(1);
  });

  it('dead-letters a message after the last attempt and lets a human requeue it', async () => {
    const name = messageName();
    const id = await stage(name);
    let isFailing = true;
    let runs = 0;

    registry.register({
      name: 'poison',
      names: [name],
      handle: () => {
        runs += 1;
        if (isFailing) {
          throw new Error('always broken');
        }
      },
    });

    for (let attempt = 0; attempt < OUTBOX_MAX_ATTEMPTS; attempt += 1) {
      await makeDue(id);
      await relay.drain();
    }

    const dead = await reload(id);

    expect(dead.status).toBe(OUTBOX_STATUS_DEAD);
    expect(dead.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(dead.deadAt).not.toBeNull();
    expect(runs).toBe(OUTBOX_MAX_ATTEMPTS);
    expect((await outbox.deadLetters(500)).map((entry) => entry.id)).toContain(
      id,
    );

    await relay.drain();
    expect(runs).toBe(OUTBOX_MAX_ATTEMPTS);

    isFailing = false;
    expect(await outbox.requeue(id)).toBe(true);
    expect(await outbox.requeue(id)).toBe(false);
    await relay.drain();

    expect((await reload(id)).status).toBe(OUTBOX_STATUS_DELIVERED);
  });

  it('does not let a poison message hold back the ones behind it', async () => {
    const poison = messageName();
    const healthy = messageName();
    await stage(poison);
    const healthyId = await stage(healthy);

    registry.register({
      name: 'poison-handler',
      names: [poison],
      handle: () => {
        throw new Error('nope');
      },
    });
    registry.register({
      name: 'healthy-handler',
      names: [healthy],
      handle: () => undefined,
    });

    await relay.drain();

    expect((await reload(healthyId)).status).toBe(OUTBOX_STATUS_DELIVERED);
  });

  it('reruns only the handlers that had not finished when a retry comes', async () => {
    const name = messageName();
    const id = await stage(name);
    const runs = { steady: 0, flaky: 0 };
    let isFlakyFailing = true;

    registry.register({
      name: 'steady',
      names: [name],
      handle: () => {
        runs.steady += 1;
      },
    });
    registry.register({
      name: 'flaky',
      names: [name],
      handle: () => {
        runs.flaky += 1;
        if (isFlakyFailing) {
          throw new Error('once');
        }
      },
    });

    await relay.drain();
    isFlakyFailing = false;
    await makeDue(id);
    await relay.drain();

    expect(runs).toEqual({ steady: 1, flaky: 2 });
    expect((await reload(id)).status).toBe(OUTBOX_STATUS_DELIVERED);
  });

  it('gives a handler the same id on every retry so it can deduplicate', async () => {
    const name = messageName();
    const id = await stage(name);
    const ids: string[] = [];
    const attempts: number[] = [];

    registry.register({
      name: 'dedupe',
      names: [name],
      handle: (delivery) => {
        ids.push(delivery.id);
        attempts.push(delivery.attempt);
        if (delivery.attempt === 1) {
          throw new Error('first try');
        }
      },
    });

    await relay.drain();
    await makeDue(id);
    await relay.drain();

    expect(ids).toEqual([id, id]);
    expect(attempts).toEqual([1, 2]);
  });

  it('does nothing when another relay holds the lock', async () => {
    const name = messageName();
    const id = await stage(name);
    const held = await locks.acquire(OUTBOX_RELAY_LOCK);

    expect(held).not.toBeNull();
    expect(await relay.drain()).toBeNull();
    expect((await reload(id)).status).toBe(OUTBOX_STATUS_PENDING);

    await held?.release();
    await relay.drain();
    expect((await reload(id)).status).toBe(OUTBOX_STATUS_DELIVERED);
  });

  it('refuses two handlers sharing one name, since the name keys the receipts', () => {
    const handler = { name: 'twin', names: ['x'], handle: () => undefined };

    registry.register(handler);

    expect(() => registry.register(handler)).toThrow('already registered');
  });

  it('prunes delivered and dead messages past their retention, receipts first', async () => {
    const now = new Date();
    const old = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);
    const deliveredOld = await stage(messageName());
    const deliveredFresh = await stage(messageName());
    const deadOld = await stage(messageName());
    const deadFresh = await stage(messageName());
    const pendingOld = await stage(messageName());

    await authPrismaClient.outboxMessage.update({
      where: { id: deliveredOld },
      data: {
        status: OUTBOX_STATUS_DELIVERED,
        deliveredAt: old(OUTBOX_DELIVERED_RETENTION_DAYS + 1),
      },
    });
    await authPrismaClient.outboxMessage.update({
      where: { id: deliveredFresh },
      data: { status: OUTBOX_STATUS_DELIVERED, deliveredAt: now },
    });
    await authPrismaClient.outboxMessage.update({
      where: { id: deadOld },
      data: {
        status: OUTBOX_STATUS_DEAD,
        deadAt: old(OUTBOX_DEAD_RETENTION_DAYS + 1),
      },
    });
    await authPrismaClient.outboxMessage.update({
      where: { id: deadFresh },
      data: { status: OUTBOX_STATUS_DEAD, deadAt: old(1) },
    });
    await authPrismaClient.outboxMessage.update({
      where: { id: pendingOld },
      data: { createdAt: old(365) },
    });
    await authPrismaClient.outboxReceipt.create({
      data: { messageId: deliveredOld, handler: 'collector' },
    });

    await outbox.prune(now);

    const remaining = await authPrismaClient.outboxMessage.findMany({
      where: {
        id: {
          in: [deliveredOld, deliveredFresh, deadOld, deadFresh, pendingOld],
        },
      },
      select: { id: true },
    });

    expect(remaining.map((message) => message.id).sort()).toEqual(
      [deliveredFresh, deadFresh, pendingOld].sort(),
    );
    expect(
      await authPrismaClient.outboxReceipt.count({
        where: { messageId: deliveredOld },
      }),
    ).toBe(0);
  });
});

const POLL_INTERVAL_MS = 50;
const DELIVERY_TIMEOUT_MS = 8_000;

async function waitFor(isDone: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS;

  while (!(await isDone())) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the outbox relay');
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

describe('OutboxModule relay worker (real database and Redis)', () => {
  const created: string[] = [];
  let app: TestingModule;

  afterAll(async () => {
    await authPrismaClient.outboxReceipt.deleteMany({
      where: { messageId: { in: created } },
    });
    await authPrismaClient.outboxMessage.deleteMany({
      where: { id: { in: created } },
    });
    await app.close();
    await authPrismaClient.$disconnect();
  });

  it('delivers a staged message on its own, without anyone calling drain', async () => {
    const options: OutboxRelayOptions = { isEnabled: true, intervalMs: 100 };

    await authPrismaClient.outboxMessage.updateMany({
      where: { status: OUTBOX_STATUS_PENDING },
      data: { status: OUTBOX_STATUS_DELIVERED, deliveredAt: new Date() },
    });

    app = await Test.createTestingModule({ imports: [OutboxModule] })
      .overrideProvider(OUTBOX_RELAY_OPTIONS)
      .useValue(options)
      .compile();
    await app.init();

    const name = `spec.runner.${randomUUID()}`;
    const seen: OutboxDelivery[] = [];

    app.get(OutboxRegistry).register({
      name: `runner-${name}`,
      names: [name],
      handle: (delivery) => {
        seen.push(delivery);
      },
    });

    const message = await authPrismaClient.outboxMessage.create({
      data: { name, payload: { ok: true } },
    });
    created.push(message.id);

    await waitFor(async () => {
      const current = await authPrismaClient.outboxMessage.findUniqueOrThrow({
        where: { id: message.id },
      });

      return current.status === OUTBOX_STATUS_DELIVERED;
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.id).toBe(message.id);
  });
});

describe('outboxBackoffMs', () => {
  it('doubles per attempt and stops growing at the cap', () => {
    expect(outboxBackoffMs(1)).toBe(OUTBOX_BACKOFF_BASE_MS);
    expect(outboxBackoffMs(2)).toBe(OUTBOX_BACKOFF_BASE_MS * 2);
    expect(outboxBackoffMs(3)).toBe(OUTBOX_BACKOFF_BASE_MS * 4);
    expect(outboxBackoffMs(50)).toBeLessThanOrEqual(15 * 60_000);
  });
});
