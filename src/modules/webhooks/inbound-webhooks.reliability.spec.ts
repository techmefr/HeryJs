import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import type { Job, Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import type { AuthenticatedUser } from '@heryjs/core/auth';
import { authPrismaClient } from '@heryjs/core/auth';
import { WEBHOOK_QUEUE } from '@heryjs/core/jobs';
import { OutboxRelay } from '@heryjs/core/jobs';
import { waitFor } from '#devtools/testing/wait-for';
import {
  clearWebhookHandlers,
  registerWebhookHandler,
} from '@heryjs/core/platform';
import { WebhooksProcessor } from '#modules/webhooks/webhooks.processor';
import { WebhooksService } from '#modules/webhooks/webhooks.service';

interface MintedEndpoint {
  id: string;
  secret: string;
}

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(body)
    .digest('hex');
}

describe('inbound webhook reliability', () => {
  let app: INestApplication<App>;
  let relay: OutboxRelay;
  let queue: Queue;
  const tenantA = `inbound-a-${randomUUID()}`;
  const tenantB = `inbound-b-${randomUUID()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    relay = app.get(OutboxRelay);
    queue = app.get<Queue>(getQueueToken(WEBHOOK_QUEUE));
  });

  afterAll(async () => {
    clearWebhookHandlers();
    await authPrismaClient.webhookEndpoint.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await app.close();
  });

  function mint(tenantId: string, source: string): Promise<MintedEndpoint> {
    return app
      .get(WebhooksService)
      .createEndpoint({ tenantId } as AuthenticatedUser, source);
  }

  async function deliver(
    endpoint: MintedEndpoint,
    payload: unknown,
    options: { deliveryId?: string; timestamp?: string } = {},
  ): Promise<string> {
    const body = JSON.stringify(payload);
    const timestamp = options.timestamp ?? String(Date.now());
    const call = request(app.getHttpServer())
      .post(`/webhooks/${endpoint.id}`)
      .set('x-webhook-signature', sign(endpoint.secret, timestamp, body))
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json');

    if (options.deliveryId !== undefined) {
      void call.set('x-webhook-id', options.deliveryId);
    }

    const accepted = await call.send(body).expect(202);

    return (accepted.body as { data: { eventId: string } }).data.eventId;
  }

  async function drainUntil<T>(
    probe: () => Promise<T | null | undefined>,
    timeoutMs = 10_000,
  ): Promise<T | null> {
    return waitFor(
      async () => {
        await relay.drain();
        return probe();
      },
      { timeoutMs, intervalMs: 100 },
    ).catch(() => null);
  }

  it('records a redelivery carrying the same provider id only once', async () => {
    const endpoint = await mint(tenantA, 'billing-provider');
    const deliveryId = `evt_${randomUUID()}`;

    const first = await deliver(
      endpoint,
      { event: 'invoice.paid' },
      { deliveryId, timestamp: String(Date.now() - 1000) },
    );
    const second = await deliver(
      endpoint,
      { event: 'invoice.paid' },
      { deliveryId, timestamp: String(Date.now()) },
    );

    expect(second).toBe(first);
    expect(
      await authPrismaClient.webhookEvent.count({
        where: { endpointId: endpoint.id },
      }),
    ).toBe(1);
  });

  it('records a replay of the very same signed request only once', async () => {
    const endpoint = await mint(tenantA, 'billing-provider');
    const timestamp = String(Date.now());

    const first = await deliver(endpoint, { event: 'ping' }, { timestamp });
    const second = await deliver(endpoint, { event: 'ping' }, { timestamp });

    expect(second).toBe(first);
    expect(
      await authPrismaClient.webhookEvent.count({
        where: { endpointId: endpoint.id },
      }),
    ).toBe(1);
  });

  it('keeps the same provider id apart in two tenants', async () => {
    const inA = await mint(tenantA, 'shared-provider');
    const inB = await mint(tenantB, 'shared-provider');
    const deliveryId = `evt_${randomUUID()}`;

    const eventA = await deliver(inA, { event: 'x' }, { deliveryId });
    const eventB = await deliver(inB, { event: 'x' }, { deliveryId });

    expect(eventA).not.toBe(eventB);

    const events = await authPrismaClient.webhookEvent.findMany({
      where: { id: { in: [eventA, eventB] } },
      select: { tenantId: true },
    });
    expect(events.map((event) => event.tenantId).sort()).toEqual(
      [tenantA, tenantB].sort(),
    );
  });

  it('does not lose an accepted event when the queue is down', async () => {
    const endpoint = await mint(tenantA, 'billing-provider');
    const add = jest
      .spyOn(queue, 'add')
      .mockRejectedValue(new Error('connect ECONNREFUSED redis'));

    let eventId: string;

    try {
      eventId = await deliver(endpoint, { event: 'invoice.paid' });
    } finally {
      add.mockRestore();
    }

    const processed = await drainUntil(() =>
      authPrismaClient.webhookEvent.findFirst({
        where: { id: eventId, processedAt: { not: null } },
      }),
    );

    expect(processed?.processedAt).toBeInstanceOf(Date);
  });

  it('queues the processing job with retries and backoff', async () => {
    const endpoint = await mint(tenantA, 'billing-provider');
    const eventId = await deliver(endpoint, { event: 'invoice.paid' });

    const job = await drainUntil(async () => {
      const jobs = await queue.getJobs([
        'completed',
        'active',
        'waiting',
        'delayed',
        'failed',
      ]);

      return jobs.find(
        (candidate) =>
          (candidate.data as { eventId?: string }).eventId === eventId,
      );
    });

    expect(job?.opts.attempts).toBeGreaterThan(1);
    expect(job?.opts.backoff).toMatchObject({ type: 'exponential' });
  });

  it('does not run an event a second time once it is processed', async () => {
    const endpoint = await mint(tenantA, 'replayed-source');
    const event = await authPrismaClient.webhookEvent.create({
      data: {
        endpointId: endpoint.id,
        tenantId: tenantA,
        source: 'replayed-source',
        payload: { event: 'ping' },
        processedAt: new Date(),
      },
    });
    const handled: string[] = [];
    registerWebhookHandler({
      source: 'replayed-source',
      handle: (record) => {
        handled.push(record.id);
        return Promise.resolve();
      },
    });

    await app
      .get(WebhooksProcessor)
      .process({ name: 'webhook.process', data: { eventId: event.id } } as Job);

    expect(handled).toEqual([]);
  });
});
