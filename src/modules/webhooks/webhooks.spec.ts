import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '@heryjs/core/auth';
import { databaseOwnerClient } from '#devtools/testing/database-owner-client';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import { waitFor } from '#devtools/testing/wait-for';
import type { PolicyCheck } from '@heryjs/core/capabilities';
import { ExposeAction, ExposeField } from '@heryjs/core/platform';
import { TenantContextStorage } from '@heryjs/core/tenancy';

const allowEveryone: PolicyCheck = () => ({ allowed: true, scope: 'all' });
const allowNoOne: PolicyCheck = () => ({ allowed: false });

const webhookRuns: { amount: number; tenantId: string }[] = [];

@Injectable()
class WebhookActionFixture {
  @ExposeAction('webhookfixture.record', {
    capability: allowEveryone,
    triggers: { webhook: true },
  })
  record(
    @ExposeField('webhookfixture.record.amount', {
      kind: 'number',
      min: 1,
      max: 100,
      default: 1,
    })
    amount: number,
  ): void {
    webhookRuns.push({ amount, tenantId: TenantContextStorage.getTenantId() });
  }

  @ExposeAction('webhookfixture.closed', {
    capability: allowNoOne,
    triggers: { webhook: true },
  })
  closed(): void {
    webhookRuns.push({ amount: -1, tenantId: 'closed' });
  }

  @ExposeAction('webhookfixture.optedOut', { capability: allowEveryone })
  optedOut(): void {
    webhookRuns.push({ amount: -2, tenantId: 'optedOut' });
  }
}
import {
  clearWebhookHandlers,
  registerWebhookHandler,
} from '@heryjs/core/platform';
import type { WebhookEventRecord } from '@heryjs/core/platform';

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(body)
    .digest('hex');
}

async function waitForProcessed(
  eventId: string,
  timeoutMs = 5000,
): Promise<{ processedAt: Date | null } | null> {
  return waitFor(
    async () => {
      const event = await authPrismaClient.webhookEvent.findUnique({
        where: { id: eventId },
        select: { processedAt: true },
      });

      return event?.processedAt ? event : null;
    },
    { timeoutMs, intervalMs: 100 },
  ).catch(() => null);
}

describe('Webhooks', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [WebhookActionFixture],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const promoteToAdmin = (userId: string) =>
    authPrismaClient.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });

  it('refuses a non-admin trying to create an endpoint', async () => {
    const caller = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/webhooks/endpoints')
      .set('Authorization', `Bearer ${caller.token}`)
      .send({ source: 'billing-provider' })
      .expect(403);
  });

  it('rejects a webhook signed with the wrong secret, with no distinguishing detail', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const created = await request(app.getHttpServer())
      .post('/webhooks/endpoints')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ source: 'billing-provider' })
      .expect(201);
    const { id: endpointId } = (created.body as { data: { id: string } }).data;

    const body = JSON.stringify({ event: 'invoice.paid' });
    const timestamp = String(Date.now());
    const badSignature = sign('wrong-secret', timestamp, body);

    const response = await request(app.getHttpServer())
      .post(`/webhooks/${endpointId}`)
      .set('x-webhook-signature', badSignature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);

    expect(
      (response.body as { error: { message: string } }).error.message,
    ).toBe('Rejected.');

    const events = await authPrismaClient.webhookEvent.findMany({
      where: { endpointId },
    });
    expect(events).toHaveLength(0);
  });

  it('rejects the exact same way for an endpoint id that does not exist', async () => {
    const body = JSON.stringify({ event: 'invoice.paid' });
    const timestamp = String(Date.now());

    await request(app.getHttpServer())
      .post(`/webhooks/${randomUUID()}`)
      .set('x-webhook-signature', sign('anything', timestamp, body))
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
  });

  it('rejects a correctly signed payload whose timestamp is outside the tolerance window', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const created = await request(app.getHttpServer())
      .post('/webhooks/endpoints')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ source: 'billing-provider' })
      .expect(201);
    const { id: endpointId, secret } = (
      created.body as { data: { id: string; secret: string } }
    ).data;

    const body = JSON.stringify({ event: 'invoice.paid' });
    const staleTimestamp = String(Date.now() - 10 * 60 * 1000);

    await request(app.getHttpServer())
      .post(`/webhooks/${endpointId}`)
      .set('x-webhook-signature', sign(secret, staleTimestamp, body))
      .set('x-webhook-timestamp', staleTimestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
  });

  it('accepts a validly signed webhook and runs it through Event, Job, Notification, Audit and Signal', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const created = await request(app.getHttpServer())
      .post('/webhooks/endpoints')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ source: 'billing-provider' })
      .expect(201);
    const { id: endpointId, secret } = (
      created.body as { data: { id: string; secret: string } }
    ).data;

    const body = JSON.stringify({ event: 'invoice.paid', amount: 4200 });
    const timestamp = String(Date.now());

    const accepted = await request(app.getHttpServer())
      .post(`/webhooks/${endpointId}`)
      .set('x-webhook-signature', sign(secret, timestamp, body))
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(202);
    const { eventId } = (accepted.body as { data: { eventId: string } }).data;

    const event = await authPrismaClient.webhookEvent.findUnique({
      where: { id: eventId },
    });
    expect(event?.payload).toEqual({ event: 'invoice.paid', amount: 4200 });

    const processed = await waitForProcessed(eventId);
    expect(processed?.processedAt).toBeInstanceOf(Date);

    const notification = await databaseOwnerClient.appNotification.findFirst({
      where: { userId: admin.id, type: 'webhook.received' },
    });
    expect(notification?.payload).toMatchObject({ eventId });

    const auditEntry = await authPrismaClient.auditLog.findFirst({
      where: { model: 'WebhookEvent', recordId: eventId },
    });
    expect(auditEntry?.operation).toBe('process');
  });

  async function mintEndpoint(source: string, expectedStatus: number) {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const response = await request(app.getHttpServer())
      .post('/webhooks/endpoints')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ source })
      .expect(expectedStatus);

    return {
      admin,
      endpoint: (response.body as { data: { id: string; secret: string } })
        .data,
    };
  }

  async function post(
    endpoint: { id: string; secret: string },
    payload: unknown,
  ): Promise<string> {
    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());

    const accepted = await request(app.getHttpServer())
      .post(`/webhooks/${endpoint.id}`)
      .set('x-webhook-signature', sign(endpoint.secret, timestamp, body))
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(202);

    return (accepted.body as { data: { eventId: string } }).data.eventId;
  }

  it('runs a bound exposed action with the payload as params, in the endpoint tenant', async () => {
    const { admin, endpoint } = await mintEndpoint(
      'expose:webhookfixture.record',
      201,
    );
    webhookRuns.length = 0;

    const eventId = await post(endpoint, {
      'webhookfixture.record.amount': 7,
    });

    expect((await waitForProcessed(eventId))?.processedAt).toBeInstanceOf(Date);
    expect(webhookRuns).toEqual([{ amount: 7, tenantId: 'default' }]);

    const notification = await databaseOwnerClient.appNotification.findFirst({
      where: { userId: admin.id, type: 'webhook.received' },
    });
    expect(notification).toBeNull();
  });

  it('closes an event whose payload the action refuses without running it', async () => {
    const { endpoint } = await mintEndpoint(
      'expose:webhookfixture.record',
      201,
    );
    webhookRuns.length = 0;

    const eventId = await post(endpoint, {
      'webhookfixture.record.amount': 9999,
    });

    expect((await waitForProcessed(eventId))?.processedAt).toBeInstanceOf(Date);
    expect(webhookRuns).toEqual([]);
  });

  it('refuses to bind an endpoint to an action that did not opt in', async () => {
    await mintEndpoint('expose:webhookfixture.optedOut', 400);
    await mintEndpoint('expose:webhookfixture.doesNotExist', 400);
  });

  it('refuses to bind an endpoint to an action the creator may not run', async () => {
    await mintEndpoint('expose:webhookfixture.closed', 403);
  });

  it('hands an event to the handler registered for its source and to no other', async () => {
    const { endpoint } = await mintEndpoint('handled-source', 201);
    const handled: WebhookEventRecord[] = [];
    const ignored: WebhookEventRecord[] = [];
    registerWebhookHandler({
      source: 'handled-source',
      handle: (event) => {
        handled.push(event);
        return Promise.resolve();
      },
    });
    registerWebhookHandler({
      source: 'other-source',
      handle: (event) => {
        ignored.push(event);
        return Promise.resolve();
      },
    });

    const eventId = await post(endpoint, { event: 'ping' });

    await waitForProcessed(eventId);
    clearWebhookHandlers();

    expect(handled).toHaveLength(1);
    expect(handled[0]).toMatchObject({
      id: eventId,
      source: 'handled-source',
      payload: { event: 'ping' },
    });
    expect(ignored).toHaveLength(0);
  });
});
