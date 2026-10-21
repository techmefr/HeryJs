import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { OutboxRelay } from '#technical/outbox/outbox.relay';
import { OutboxService } from '#technical/outbox/outbox.service';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { verifyOutboundWebhook } from './outbound-webhook-signature';
import { OUTBOUND_WEBHOOK_POLICY } from './outbound-webhook.constants';
import { WEBHOOK_FETCH } from './outbound-webhook.sender';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WEBHOOK_HOST_RESOLVER } from './webhook-url-guard';

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const recorded: Recorded[] = [];
let answer: () => Response | Promise<Response> = () =>
  new Response(null, { status: 200 });

const fakeFetch = (url: string, init?: RequestInit): Promise<Response> => {
  recorded.push({
    url,
    headers: init?.headers as Record<string, string>,
    body: typeof init?.body === 'string' ? init.body : '',
  });

  return Promise.resolve(answer());
};

const resolver = (host: string): Promise<string[]> =>
  Promise.resolve([host.startsWith('internal') ? '10.0.0.5' : '93.184.216.34']);

async function waitFor<T>(
  read: () => Promise<T | null | undefined>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for the condition.');
}

describe('Outbound webhooks', () => {
  let app: INestApplication<App>;
  let relay: OutboxRelay;
  let outbox: OutboxService;
  let admin: TestUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WEBHOOK_FETCH)
      .useValue(fakeFetch)
      .overrideProvider(WEBHOOK_HOST_RESOLVER)
      .useValue(resolver)
      .overrideProvider(OUTBOUND_WEBHOOK_POLICY)
      .useValue({
        attempts: 3,
        backoffMs: 50,
        keepCompleted: 100,
        keepFailed: 100,
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    relay = app.get(OutboxRelay);
    outbox = app.get(OutboxService);

    await authPrismaClient.webhookSubscription.deleteMany({
      where: { tenantId: 'default' },
    });
    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    recorded.length = 0;
    answer = () => new Response(null, { status: 200 });
  });

  const asAdmin = (token = admin.token) => ({
    Authorization: `Bearer ${token}`,
  });

  async function subscribe(url: string, events: string[]) {
    const created = await request(app.getHttpServer())
      .post('/webhook-subscriptions')
      .set(asAdmin())
      .send({ url, events })
      .expect(201);

    return (created.body as { data: { id: string; secret: string } }).data;
  }

  async function announce(name: string, tenantId = 'default') {
    const marker = randomUUID();

    await runInTenant(tenantId, () =>
      outbox.stage(authPrismaClient, name, { marker }),
    );

    // The relay holds a lock, and the app may be draining on its own: ask
    // until the message has been handed to the fan-out.
    const message = await waitFor(async () => {
      await relay.drain();

      return authPrismaClient.outboxMessage.findFirst({
        where: {
          tenantId,
          name,
          status: 'delivered',
          payload: { path: ['marker'], equals: marker },
        },
      });
    });

    return message.id;
  }

  const deliveryOf = (subscriptionId: string, messageId: string) =>
    authPrismaClient.webhookDelivery.findUnique({
      where: { subscriptionId_messageId: { subscriptionId, messageId } },
    });

  it('refuses a non-admin, and a url that is not a public https address', async () => {
    const caller = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/webhook-subscriptions')
      .set(asAdmin(caller.token))
      .send({ url: 'https://hooks.acme.test', events: ['*'] })
      .expect(403);

    for (const url of [
      'http://hooks.acme.test',
      'https://internal.acme.test',
      'https://169.254.169.254/latest',
    ]) {
      await request(app.getHttpServer())
        .post('/webhook-subscriptions')
        .set(asAdmin())
        .send({ url, events: ['*'] })
        .expect(422);
    }

    await request(app.getHttpServer())
      .post('/webhook-subscriptions')
      .set(asAdmin())
      .send({ url: 'https://hooks.acme.test', events: ['event:InvoicePaid'] })
      .expect(400);
  });

  it('shows the secret once, and never on a read', async () => {
    const created = await subscribe('https://hooks.acme.test/once', ['*']);

    expect(created.secret).toMatch(/^whsec_/);

    const stored = await authPrismaClient.webhookSubscription.findUnique({
      where: { id: created.id },
    });
    expect(stored?.secret).not.toContain(created.secret);

    const read = await request(app.getHttpServer())
      .get(`/webhook-subscriptions/${created.id}`)
      .set(asAdmin())
      .expect(200);
    expect(JSON.stringify(read.body)).not.toContain(created.secret);
    expect(JSON.stringify(read.body)).not.toContain('"secret"');
  });

  it('delivers a subscribed event, signed, to that subscription only', async () => {
    const wanted = await subscribe('https://hooks.acme.test/paid', [
      'webhook.invoice.paid',
    ]);
    const other = await subscribe('https://hooks.acme.test/refunds', [
      'webhook.invoice.refunded',
    ]);
    const foreign = await authPrismaClient.webhookSubscription.create({
      data: {
        tenantId: `tenant-${randomUUID()}`,
        url: 'https://hooks.acme.test/foreign',
        events: ['*'],
        secret: 'not-readable',
      },
    });

    const messageId = await announce('webhook.invoice.paid');
    const delivery = await waitFor(async () => {
      const row = await deliveryOf(wanted.id, messageId);

      return row?.status === 'delivered' ? row : null;
    });

    expect(delivery.attempts).toBe(1);
    expect(delivery.lastStatusCode).toBe(200);
    expect(await deliveryOf(other.id, messageId)).toBeNull();
    expect(await deliveryOf(foreign.id, messageId)).toBeNull();

    const sent = recorded.filter((call) => call.url.endsWith('/paid'));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.headers['x-webhook-event']).toBe('webhook.invoice.paid');
    expect(sent[0]?.headers['x-webhook-id']).toBe(delivery.id);
    expect(
      verifyOutboundWebhook({
        secret: wanted.secret,
        header: sent[0]?.headers['x-webhook-signature'] ?? '',
        timestamp: sent[0]?.headers['x-webhook-timestamp'] ?? '',
        rawBody: Buffer.from(sent[0]?.body ?? ''),
        toleranceSeconds: 300,
      }),
    ).toBe(true);
    expect(JSON.parse(sent[0]?.body ?? '{}')).toMatchObject({
      id: messageId,
      event: 'webhook.invoice.paid',
    });
  });

  it('never delivers a message that was not staged for customers', async () => {
    const catchAll = await subscribe('https://hooks.acme.test/all', ['*']);

    const messageId = await announce('invoice.internal');

    expect(await deliveryOf(catchAll.id, messageId)).toBeNull();
  });

  it('retries a failing endpoint, lands it in the dead letters, and replays it', async () => {
    answer = () => new Response(null, { status: 500 });
    const failing = await subscribe('https://hooks.acme.test/failing', [
      'webhook.order.shipped',
    ]);

    const messageId = await announce('webhook.order.shipped');
    const dead = await waitFor(async () => {
      const row = await deliveryOf(failing.id, messageId);

      return row?.status === 'dead' ? row : null;
    });

    expect(dead.attempts).toBe(3);
    expect(dead.lastStatusCode).toBe(500);
    expect(dead.lastError).toContain('500');
    expect(dead.deadAt).toBeInstanceOf(Date);

    const listed = await request(app.getHttpServer())
      .get('/webhook-deliveries?status=dead')
      .set(asAdmin())
      .expect(200);
    expect(
      (listed.body as { data: { id: string }[] }).data.map((row) => row.id),
    ).toContain(dead.id);

    await request(app.getHttpServer())
      .post(`/webhook-deliveries/${dead.id}/redeliver`)
      .set(asAdmin())
      .expect(201);

    await request(app.getHttpServer())
      .post(`/webhook-deliveries/${dead.id}/redeliver`)
      .set(asAdmin())
      .expect(409);

    // Still failing: a replay gets a fresh attempt budget and dies again.
    const dead2 = await waitFor(async () => {
      const row = await deliveryOf(failing.id, messageId);

      return row?.status === 'dead' && row.round === 1 ? row : null;
    });
    expect(dead2.attempts).toBe(3);

    answer = () => new Response(null, { status: 204 });
    await request(app.getHttpServer())
      .post(`/webhook-deliveries/${dead.id}/redeliver`)
      .set(asAdmin())
      .expect(201);

    const delivered = await waitFor(async () => {
      const row = await deliveryOf(failing.id, messageId);

      return row?.status === 'delivered' ? row : null;
    });
    expect(delivered.round).toBe(2);
  });

  it('records a transport failure as a failed attempt', async () => {
    answer = () => {
      throw new Error('connect ECONNREFUSED');
    };
    const refusing = await subscribe('https://hooks.acme.test/refusing', [
      'webhook.order.cancelled',
    ]);

    const messageId = await announce('webhook.order.cancelled');
    const dead = await waitFor(async () => {
      const row = await deliveryOf(refusing.id, messageId);

      return row?.status === 'dead' ? row : null;
    });

    expect(dead.lastStatusCode).toBeNull();
    expect(dead.lastError).toContain('ECONNREFUSED');
  });

  it('rotates the secret without dropping events: both secrets verify during the grace window', async () => {
    const subscription = await subscribe('https://hooks.acme.test/rotating', [
      'webhook.rotation.test',
    ]);

    const rotated = await request(app.getHttpServer())
      .post(`/webhook-subscriptions/${subscription.id}/rotate-secret`)
      .set(asAdmin())
      .send({})
      .expect(201);
    const { secret: newSecret } = (rotated.body as { data: { secret: string } })
      .data;
    expect(newSecret).not.toBe(subscription.secret);

    const messageId = await announce('webhook.rotation.test');
    await waitFor(async () => {
      const row = await deliveryOf(subscription.id, messageId);

      return row?.status === 'delivered' ? row : null;
    });

    const call = recorded.find((entry) => entry.url.endsWith('/rotating'));
    const verifyWith = (secret: string) =>
      verifyOutboundWebhook({
        secret,
        header: call?.headers['x-webhook-signature'] ?? '',
        timestamp: call?.headers['x-webhook-timestamp'] ?? '',
        rawBody: Buffer.from(call?.body ?? ''),
        toleranceSeconds: 300,
      });

    expect(verifyWith(newSecret)).toBe(true);
    expect(verifyWith(subscription.secret)).toBe(true);

    await authPrismaClient.webhookSubscription.update({
      where: { id: subscription.id },
      data: { previousSecretExpiresAt: new Date(Date.now() - 1000) },
    });
    recorded.length = 0;

    const later = await announce('webhook.rotation.test');
    await waitFor(async () => {
      const row = await deliveryOf(subscription.id, later);

      return row?.status === 'delivered' ? row : null;
    });

    const afterGrace = recorded.find((entry) =>
      entry.url.endsWith('/rotating'),
    );
    expect(
      (afterGrace?.headers['x-webhook-signature'] ?? '').split(','),
    ).toHaveLength(1);
  });

  it('delivers model change messages and stops delivering to a disabled subscription', async () => {
    const watching = await subscribe('https://hooks.acme.test/models', [
      'model.*',
    ]);

    const first = await announce('model.created');
    await waitFor(async () => {
      const row = await deliveryOf(watching.id, first);

      return row?.status === 'delivered' ? row : null;
    });

    await request(app.getHttpServer())
      .patch(`/webhook-subscriptions/${watching.id}`)
      .set(asAdmin())
      .send({ active: false })
      .expect(200);

    const second = await announce('model.updated');

    expect(await deliveryOf(watching.id, second)).toBeNull();
  });

  it('keeps one tenant away from another tenant subscriptions and deliveries', async () => {
    const foreign = await authPrismaClient.webhookSubscription.create({
      data: {
        tenantId: `tenant-${randomUUID()}`,
        url: 'https://hooks.acme.test/foreign-read',
        events: ['*'],
        secret: 'not-readable',
      },
    });

    await request(app.getHttpServer())
      .get(`/webhook-subscriptions/${foreign.id}`)
      .set(asAdmin())
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/webhook-subscriptions/${foreign.id}`)
      .set(asAdmin())
      .send({ active: false })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/webhook-subscriptions/${foreign.id}/rotate-secret`)
      .set(asAdmin())
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/webhook-subscriptions/${foreign.id}`)
      .set(asAdmin())
      .expect(404);

    const stillThere = await authPrismaClient.webhookSubscription.findUnique({
      where: { id: foreign.id },
    });
    expect(stillThere?.active).toBe(true);

    const listed = await request(app.getHttpServer())
      .get('/webhook-subscriptions')
      .set(asAdmin())
      .expect(200);
    expect(
      (listed.body as { data: { id: string }[] }).data.map((row) => row.id),
    ).not.toContain(foreign.id);
  });

  it('prunes finished deliveries past retention and keeps pending ones', async () => {
    const subscription = await subscribe('https://hooks.acme.test/prune', [
      'webhook.prune.test',
    ]);
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const make = (status: string, messageId: string) =>
      authPrismaClient.webhookDelivery.create({
        data: {
          subscriptionId: subscription.id,
          tenantId: 'default',
          messageId,
          event: 'webhook.prune.test',
          payload: {},
          status,
          createdAt: old,
        },
      });
    const [delivered, pending] = await Promise.all([
      make('delivered', randomUUID()),
      make('pending', randomUUID()),
    ]);

    await app.get(WebhookDeliveryService).prune(30);

    expect(
      await authPrismaClient.webhookDelivery.findUnique({
        where: { id: delivered.id },
      }),
    ).toBeNull();
    expect(
      await authPrismaClient.webhookDelivery.findUnique({
        where: { id: pending.id },
      }),
    ).not.toBeNull();
  });
});
