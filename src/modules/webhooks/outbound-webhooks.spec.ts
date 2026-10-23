import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '@heryjs/core/auth';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { waitFor } from '#devtools/testing/wait-for';
import { OutboxRelay } from '@heryjs/core/jobs';
import { OutboxService } from '@heryjs/core/jobs';
import { runInTenant } from '@heryjs/core/tenancy';
import { verifyOutboundWebhook } from '#modules/webhooks/outbound-webhook-signature';
import { OUTBOUND_WEBHOOK_POLICY } from '#modules/webhooks/outbound-webhook.constants';
import { WebhookDeliveryService } from '#modules/webhooks/webhook-delivery.service';

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: string;
}

type Behaviour = 'ok' | 'fail' | 'drop';

const recorded: Recorded[] = [];
let behaviour: Behaviour = 'ok';
let base = '';

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    recorded.push({
      url: req.url ?? '',
      headers: req.headers as Record<string, string>,
      body: Buffer.concat(chunks).toString('utf8'),
    });

    if (behaviour === 'drop') {
      req.socket.destroy();
      return;
    }

    res.statusCode = behaviour === 'fail' ? 500 : 204;
    res.end();
  });
});

describe('Outbound webhooks', () => {
  let app: INestApplication<App>;
  let relay: OutboxRelay;
  let outbox: OutboxService;
  let admin: TestUser;

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    recorded.length = 0;
    behaviour = 'ok';
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
      'ftp://hooks.acme.test',
      'not a url',
      'https://user:pass@hooks.acme.test',
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
    const created = await subscribe(`${base}/once`, ['*']);

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
    const wanted = await subscribe(`${base}/paid`, ['webhook.invoice.paid']);
    const other = await subscribe(`${base}/refunds`, [
      'webhook.invoice.refunded',
    ]);
    const foreign = await authPrismaClient.webhookSubscription.create({
      data: {
        tenantId: `tenant-${randomUUID()}`,
        url: `${base}/foreign`,
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
    expect(delivery.lastStatusCode).toBe(204);
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
    const catchAll = await subscribe(`${base}/all`, ['*']);

    const messageId = await announce('invoice.internal');

    expect(await deliveryOf(catchAll.id, messageId)).toBeNull();
  });

  it('retries a failing endpoint, lands it in the dead letters, and replays it', async () => {
    behaviour = 'fail';
    const failing = await subscribe(`${base}/failing`, [
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

    behaviour = 'ok';
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
    behaviour = 'drop';
    const refusing = await subscribe(`${base}/refusing`, [
      'webhook.order.cancelled',
    ]);

    const messageId = await announce('webhook.order.cancelled');
    const dead = await waitFor(async () => {
      const row = await deliveryOf(refusing.id, messageId);

      return row?.status === 'dead' ? row : null;
    });

    expect(dead.lastStatusCode).toBeNull();
    expect(dead.lastError).toBeTruthy();
  });

  it('rotates the secret without dropping events: both secrets verify during the grace window', async () => {
    const subscription = await subscribe(`${base}/rotating`, [
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
    const watching = await subscribe(`${base}/models`, ['model.*']);

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
        url: `${base}/foreign-read`,
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
    const subscription = await subscribe(`${base}/prune`, [
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
