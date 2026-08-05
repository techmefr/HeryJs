import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';

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
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const event = await authPrismaClient.webhookEvent.findUnique({
      where: { id: eventId },
      select: { processedAt: true },
    });

    if (event?.processedAt) {
      return event;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}

describe('Webhooks', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
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

    const notification = await authPrismaClient.appNotification.findFirst({
      where: { userId: admin.id, type: 'webhook.received' },
    });
    expect(notification?.payload).toMatchObject({ eventId });

    const auditEntry = await authPrismaClient.auditLog.findFirst({
      where: { model: 'WebhookEvent', recordId: eventId },
    });
    expect(auditEntry?.operation).toBe('process');
  });
});
