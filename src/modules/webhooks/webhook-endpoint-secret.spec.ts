import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import type { AuthenticatedUser } from '@heryjs/core/auth';
import { authPrismaClient } from '@heryjs/core/auth';
import { WebhookEndpointSecretService } from '#modules/webhooks/webhook-endpoint-secret.service';
import { WebhooksService } from '#modules/webhooks/webhooks.service';

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(body)
    .digest('hex');
}

describe('inbound webhook endpoint secret', () => {
  let app: INestApplication<App>;
  const tenantId = `endpoint-secret-${randomUUID()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await authPrismaClient.webhookEndpoint.deleteMany({ where: { tenantId } });
    await app.close();
  });

  function deliver(endpointId: string, secret: string) {
    const body = JSON.stringify({ event: 'ping', nonce: randomUUID() });
    const timestamp = String(Date.now());

    return request(app.getHttpServer())
      .post(`/webhooks/${endpointId}`)
      .set('x-webhook-signature', sign(secret, timestamp, body))
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body);
  }

  function legacyEndpoint(secret: string) {
    return authPrismaClient.webhookEndpoint.create({
      data: { tenantId, source: 'legacy-provider', secret },
    });
  }

  it('stores a new endpoint secret sealed and still verifies its signature', async () => {
    const minted = await app
      .get(WebhooksService)
      .createEndpoint({ tenantId } as AuthenticatedUser, 'billing-provider');

    const row = await authPrismaClient.webhookEndpoint.findUniqueOrThrow({
      where: { id: minted.id },
    });

    expect(row.secret).not.toBe(minted.secret);
    expect(row.secret).not.toContain(minted.secret);
    await deliver(minted.id, minted.secret).expect(202);
  });

  it('keeps verifying an endpoint whose secret predates sealing', async () => {
    const secret = randomBytes(32).toString('hex');
    const endpoint = await legacyEndpoint(secret);

    await deliver(endpoint.id, secret).expect(202);
  });

  it('seals the plaintext secrets left by earlier versions, once', async () => {
    const secret = randomBytes(32).toString('hex');
    const endpoint = await legacyEndpoint(secret);
    const migration = app.get(WebhookEndpointSecretService);

    expect(await migration.sealPlaintext()).toBeGreaterThanOrEqual(1);

    const row = await authPrismaClient.webhookEndpoint.findUniqueOrThrow({
      where: { id: endpoint.id },
    });

    expect(row.secret).not.toContain(secret);
    await deliver(endpoint.id, secret).expect(202);

    const sealedOnce = row.secret;
    await migration.sealPlaintext();

    expect(
      (
        await authPrismaClient.webhookEndpoint.findUniqueOrThrow({
          where: { id: endpoint.id },
        })
      ).secret,
    ).toBe(sealedOnce);
  });
});
