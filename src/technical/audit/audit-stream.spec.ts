import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import {
  OUTBOX_STATUS_DELIVERED,
  OUTBOX_STATUS_PENDING,
} from '#technical/outbox/outbox.constants';
import { OutboxRelay } from '#technical/outbox/outbox.relay';
import { storageDriverToken } from '#technical/storage/storage-driver';
import { writeAuditLog } from './audit-log';
import { AUDIT_STREAM_MESSAGE } from './audit-sink.constants';
import { AUDIT_SINK_OPTIONS } from './audit-sink.delivery';
import { AuditStreamService } from './audit-stream.service';

const stored = new Map<string, string>();

@Module({
  providers: [
    {
      provide: storageDriverToken('memory'),
      useValue: {
        put: (key: string, body: Buffer) => {
          stored.set(key, body.toString('utf8'));
          return Promise.resolve({ key, contentType: 'x' });
        },
      },
    },
  ],
})
class MemoryStorageModule {}

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

describe('audit streaming to a sink (real database)', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let tenantId: string;
  let relay: OutboxRelay;
  let stream: AuditStreamService;
  let server: Server;
  let url: string;
  let status = 200;
  const received: Received[] = [];
  const createdSinks: string[] = [];

  const write = (recordId: string) =>
    writeAuditLog(authPrismaClient, {
      tenantId,
      model: 'BlogPost',
      operation: 'create',
      recordId,
      data: { recordId },
      userId: admin.id,
      impersonatedBy: null,
    });

  const createSink = async (body: object): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/audit-sinks')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body)
      .expect(201);
    const { id } = (res.body as { data: { id: string } }).data;

    createdSinks.push(id);

    return id;
  };

  const stagedFor = (sinkId: string) =>
    authPrismaClient.outboxMessage.findMany({
      where: {
        tenantId,
        name: AUDIT_STREAM_MESSAGE,
        payload: { path: ['sinkId'], equals: sinkId },
      },
      orderBy: { createdAt: 'asc' },
    });

  // Other specs drain the same table with a registry that has no handler for
  // an audit range, which marks it delivered unseen. A staged range is
  // therefore parked in the future until this spec drains it itself.
  const park = (id: string) =>
    authPrismaClient.outboxMessage.update({
      where: { id },
      data: { nextAttemptAt: new Date(Date.now() + 3_600_000) },
    });

  const drainNow = async (id: string) => {
    await authPrismaClient.outboxMessage.update({
      where: { id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await relay.drain()) !== null) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('the outbox relay lock was never free');
  };

  const stageParked = async (sinkId: string): Promise<string[]> => {
    await stream.streamSink(sinkId);

    const messages = await stagedFor(sinkId);

    await Promise.all(messages.map((message) => park(message.id)));

    return messages.map((message) => message.id);
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => {
        if (status < 300) {
          received.push({ headers: req.headers, body });
        }
        res.statusCode = status;
        res.end();
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ingest`;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, MemoryStorageModule],
    })
      .overrideProvider(AUDIT_SINK_OPTIONS)
      .useValue({ allowPrivateHosts: true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    relay = app.get(OutboxRelay);
    stream = app.get(AuditStreamService);

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    tenantId = `audit-stream-${randomUUID()}`;
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { tenantId },
    });
  });

  afterAll(async () => {
    const messages = await authPrismaClient.outboxMessage.findMany({
      where: { tenantId, name: AUDIT_STREAM_MESSAGE },
      select: { id: true },
    });
    const ids = messages.map((message) => message.id);

    await authPrismaClient.outboxReceipt.deleteMany({
      where: { messageId: { in: ids } },
    });
    await authPrismaClient.outboxMessage.deleteMany({
      where: { id: { in: ids } },
    });
    await authPrismaClient.auditSink.deleteMany({ where: { tenantId } });
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('retries a failing sink through the outbox, then delivers each entry once', async () => {
    await write('r1');
    await write('r2');
    await write('r3');

    const sinkId = await createSink({
      name: 'siem',
      kind: 'http',
      url,
      authToken: 'tok-123',
      backfill: true,
    });

    const flushed = await request(app.getHttpServer())
      .post(`/audit-sinks/${sinkId}/stream`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect((flushed.body as { data: { batches: number } }).data.batches).toBe(
      1,
    );

    const [messageId = ''] = await Promise.all(
      (await stagedFor(sinkId)).map(async (message) => {
        await park(message.id);

        return message.id;
      }),
    );

    status = 503;
    await drainNow(messageId);

    const afterFailure = await authPrismaClient.outboxMessage.findUniqueOrThrow(
      { where: { id: messageId } },
    );
    const failing = await authPrismaClient.auditSink.findUniqueOrThrow({
      where: { id: sinkId },
    });

    expect(afterFailure.status).toBe(OUTBOX_STATUS_PENDING);
    expect(afterFailure.attempts).toBe(1);
    expect(afterFailure.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(failing.lastError).toContain('HTTP 503');
    expect(received).toHaveLength(0);

    status = 200;
    await drainNow(afterFailure.id);

    const delivered = await authPrismaClient.outboxMessage.findUniqueOrThrow({
      where: { id: afterFailure.id },
    });
    const healthy = await authPrismaClient.auditSink.findUniqueOrThrow({
      where: { id: sinkId },
    });

    expect(delivered.status).toBe(OUTBOX_STATUS_DELIVERED);
    expect(healthy.lastError).toBeNull();
    expect(healthy.lastDeliveredAt).not.toBeNull();
    expect(received).toHaveLength(1);
    expect(received[0]?.headers.authorization).toBe('Bearer tok-123');
    expect(received[0]?.headers['idempotency-key']).toMatch(
      new RegExp(`^audit-${sinkId}-\\d+-\\d+$`),
    );

    const lines = received[0]?.body.trimEnd().split('\n') ?? [];

    expect(
      lines.map((line) => (JSON.parse(line) as { recordId: string }).recordId),
    ).toEqual(['r1', 'r2', 'r3']);
    expect(healthy.lastDeliveredSequence).toBe(
      (JSON.parse(lines[2] ?? '') as { sequence: number }).sequence,
    );

    // Nothing new: streaming again stages nothing and sends nothing.
    expect(await stream.streamSink(sinkId)).toBe(0);

    await write('r4');

    const [, secondId = ''] = await stageParked(sinkId);

    await drainNow(secondId);

    expect(
      (
        await authPrismaClient.outboxMessage.findUniqueOrThrow({
          where: { id: secondId },
        })
      ).status,
    ).toBe(OUTBOX_STATUS_DELIVERED);
    expect(received).toHaveLength(2);
    expect(received[1]?.body.trimEnd().split('\n')).toHaveLength(1);
    expect(received[1]?.body).toContain('"recordId":"r4"');
  });

  it('writes to an object-storage sink under a deterministic key', async () => {
    await write('s1');

    const sinkId = await createSink({
      name: 'archive',
      kind: 'storage',
      storageDriver: 'memory',
      keyPrefix: 'siem',
      backfill: true,
    });

    const [messageId = ''] = await stageParked(sinkId);

    await drainNow(messageId);

    const key = [...stored.keys()].find((candidate) =>
      candidate.startsWith(`siem/${tenantId}/`),
    );

    expect(key).toMatch(/^siem\/.+\/\d{12}-\d{12}\.jsonl$/);
    expect(stored.get(key ?? '')).toContain('"recordId":"s1"');
  });

  it('does not stream while a sink is switched off, and picks up where it stopped', async () => {
    const sinkId = await createSink({
      name: 'paused',
      kind: 'storage',
      storageDriver: 'memory',
      keyPrefix: 'paused',
    });

    await request(app.getHttpServer())
      .patch(`/audit-sinks/${sinkId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ active: false })
      .expect(200);
    await write('p1');

    expect(await stream.streamSink(sinkId)).toBe(0);
    expect(await stagedFor(sinkId)).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/audit-sinks/${sinkId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ active: true })
      .expect(200);

    expect(await stream.streamSink(sinkId)).toBe(1);
  });

  it('lets two instances race on one sink without staging a range twice', async () => {
    const sinkId = await createSink({
      name: 'race',
      kind: 'storage',
      storageDriver: 'memory',
      keyPrefix: 'race',
      backfill: true,
    });

    await write('x1');
    await Promise.all([
      stream.streamSink(sinkId),
      stream.streamSink(sinkId),
      stream.streamSink(sinkId),
    ]);

    const staged = await stagedFor(sinkId);
    const ranges = staged.map((message) => {
      const payload = message.payload as {
        fromSequence: number;
        toSequence: number;
      };

      return `${payload.fromSequence}-${payload.toSequence}`;
    });

    expect(new Set(ranges).size).toBe(ranges.length);
  });

  it('probes a sink with the real transport and reports the failure', async () => {
    const sinkId = await createSink({
      name: 'probe',
      kind: 'http',
      url,
    });

    status = 200;

    const good = await request(app.getHttpServer())
      .post(`/audit-sinks/${sinkId}/test`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect((good.body as { data: unknown }).data).toEqual({
      ok: true,
      error: null,
    });

    status = 500;

    const bad = await request(app.getHttpServer())
      .post(`/audit-sinks/${sinkId}/test`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect((bad.body as { data: unknown }).data).toMatchObject({
      ok: false,
      error: expect.stringContaining('HTTP 500') as unknown,
    });

    status = 200;
  });

  it('treats a staged range whose sink was deleted as delivered, not as an error to retry', async () => {
    const sinkId = await createSink({
      name: 'doomed',
      kind: 'storage',
      storageDriver: 'memory',
      keyPrefix: 'doomed',
      backfill: true,
    });

    await write(randomUUID());

    const [messageId = ''] = await stageParked(sinkId);

    await request(app.getHttpServer())
      .delete(`/audit-sinks/${sinkId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    await drainNow(messageId);

    expect(
      (
        await authPrismaClient.outboxMessage.findUniqueOrThrow({
          where: { id: messageId },
        })
      ).status,
    ).toBe(OUTBOX_STATUS_DELIVERED);
    expect(
      [...stored.keys()].filter((key) => key.startsWith('doomed/')),
    ).toHaveLength(0);
  });
});
