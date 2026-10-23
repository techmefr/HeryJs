import { randomUUID } from 'node:crypto';
import { INestApplication, Logger as NestLogger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { App } from 'supertest/types';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { databaseOwnerClient } from '#devtools/testing/database-owner-client';
import { env } from '#technical/config/env';
import { waitFor } from '#devtools/testing/wait-for';
import { logPipeline } from './log.pipeline';
import type { LogDriver, LogEntry } from './log-driver';

class CapturingLogDriver implements LogDriver {
  readonly lines: string[] = [];

  write(entry: LogEntry): void {
    this.lines.push(entry.raw);
  }
}

describe('what reaches the logs', () => {
  const capture = new CapturingLogDriver();
  const consoleLines: string[] = [];
  const previousLevel = env.LOG_LEVEL;
  let app: INestApplication<App>;

  beforeAll(async () => {
    Object.assign(env, { LOG_LEVEL: 'trace' });
    const { AppModule } = await import('#app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    logPipeline.attach([capture]);

    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map(String).join(' '));
      });
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
    await logPipeline.detach();
    Object.assign(env, { LOG_LEVEL: previousLevel });
  });

  it('never carries a name, an address, a phone number, a token or a password', async () => {
    const server = app.getHttpServer();
    const email = `leak-${randomUUID()}@example.test`;
    const password = `pw-${randomUUID()}`;
    const name = `Leaky Name ${randomUUID().slice(0, 8)}`;
    const phoneNumber = `+3361${Math.floor(1000000 + Math.random() * 8999999)}`;

    await request(server)
      .post('/auth/register')
      .send({ email, password, name })
      .expect(201);

    const login = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    const { token } = (login.body as { data: { token: string } }).data;
    const authorization = `Bearer ${token}`;

    await request(server)
      .post('/auth/update-user')
      .set('Authorization', authorization)
      .send({ name: `${name} updated`, phoneNumber, email });

    await request(server)
      .post('/auth/register')
      .send({ email, password: 'x' })
      .expect((response) => {
        expect(response.status).toBeGreaterThanOrEqual(400);
      });

    await request(server)
      .post(`/auth/login?email=${encodeURIComponent(email)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, password: `${password}-wrong` });

    const exported = await request(server)
      .post('/privacy/exports')
      .set('Authorization', authorization)
      .send({})
      .expect(202);
    const requestId = (exported.body as { data: { id: string } }).data.id;

    await waitFor(
      async () =>
        (
          await databaseOwnerClient.privacyRequest.findUniqueOrThrow({
            where: { id: requestId },
          })
        ).status === 'done',
      { timeoutMs: 20_000, description: 'the export job to complete' },
    );

    const appLogger = new NestLogger('LeakProbe');

    appLogger.error(
      new Error(`validation failed: ${email} is already taken`).message,
      new Error(`at register (${email})`).stack,
    );
    appLogger.warn({
      msg: 'job failed',
      job: { name: 'mail.send', data: { email, name, phoneNumber, password } },
      headers: { authorization },
    });
    appLogger.log(`sent to <${email}> on ${phoneNumber}, token ${token}`);

    const output = [...capture.lines, ...consoleLines].join('\n');

    expect(capture.lines.length).toBeGreaterThan(0);
    expect(output).toContain('LeakProbe');

    for (const secret of [
      email,
      password,
      name,
      phoneNumber,
      token,
      phoneNumber.slice(1),
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
