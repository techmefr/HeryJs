import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { HERY_CONFIG, heryConfig } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import { DatabaseLogDriver } from './database-log.driver';
import { parseLogLine } from './log-line';

interface LogBody {
  level: string;
  message: string;
}

const WITH_STORE: HeryConfig = {
  ...heryConfig,
  logging: {
    default: 'store',
    drivers: {
      stdout: { driver: 'stdout' },
      store: { driver: 'database' },
    },
  },
};

async function bootApp(config: HeryConfig): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(HERY_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();

  return app;
}

async function asAdmin(app: INestApplication<App>): Promise<TestUser> {
  const user = await registerAndLogin(app);
  await authPrismaClient.user.update({
    where: { id: user.id },
    data: { role: 'admin' },
  });

  return user;
}

function line(tenantId: string, level: number, message: string) {
  return parseLogLine(JSON.stringify({ level, msg: message, tenantId }));
}

function clearSpecLines(): Promise<unknown> {
  return authPrismaClient.logEntry.deleteMany({
    where: { message: { startsWith: 'http-spec' } },
  });
}

describe('GET /logs with a persisted store declared', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let member: TestUser;
  let tenantId: string;
  let store: DatabaseLogDriver;

  beforeAll(async () => {
    app = await bootApp(WITH_STORE);
    admin = await asAdmin(app);
    member = await registerAndLogin(app);
    store = app.get(DatabaseLogDriver);
    tenantId = (
      await authPrismaClient.user.findUniqueOrThrow({
        where: { id: admin.id },
        select: { tenantId: true },
      })
    ).tenantId;
  });

  beforeEach(async () => {
    await clearSpecLines();
  });

  afterAll(async () => {
    await clearSpecLines();
    await app.close();
  });

  it('refuses a caller with no session', async () => {
    await request(app.getHttpServer()).get('/logs').expect(401);
  });

  it('refuses a caller who is not an admin', async () => {
    await request(app.getHttpServer())
      .get('/logs')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
  });

  it("lists the admin's tenant and never another's", async () => {
    store.write(line(tenantId, 50, 'http-spec mine'));
    store.write(line('http-spec-foreign', 50, 'http-spec theirs'));
    await store.flush();

    const response = await request(app.getHttpServer())
      .get('/logs?text=http-spec')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const body = response.body as { data: LogBody[]; meta: { total: number } };

    expect(body.data.map((row) => row.message)).toEqual(['http-spec mine']);
    expect(body.meta.total).toBe(1);
  });

  it('filters by level', async () => {
    store.write(line(tenantId, 30, 'http-spec-level quiet'));
    store.write(line(tenantId, 50, 'http-spec-level loud'));
    await store.flush();

    const response = await request(app.getHttpServer())
      .get('/logs?text=http-spec-level&level=error')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(
      (response.body as { data: LogBody[] }).data.map((row) => row.message),
    ).toEqual(['http-spec-level loud']);
  });

  it.each(['level=loud', 'from=yesterday-ish', 'limit=7'])(
    'rejects an invalid query (%s)',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/logs?${query}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    },
  );
});

describe('GET /logs with nothing that keeps logs', () => {
  let app: INestApplication<App>;
  let admin: TestUser;

  beforeAll(async () => {
    app = await bootApp(heryConfig);
    admin = await asAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 404 rather than an empty page', async () => {
    const response = await request(app.getHttpServer())
      .get('/logs')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect((response.body as { error: { key: string } }).error.key).toBe(
      'log.query-unavailable',
    );
  });
});
