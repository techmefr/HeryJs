import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import { DEV_DASHBOARD_SETTINGS } from './dev-dashboard.settings';
import type { DevDashboardSettings } from './dev-dashboard.settings';
import { DevDashboardRecorder } from './dev-dashboard.recorder';
import { DevDashboardStore } from './dev-dashboard.store';
import type { NewDevDashboardEntry } from './dev-dashboard.types';

const ENABLED: DevDashboardSettings = {
  isEnabled: true,
  retentionHours: 24,
  maxEntriesPerTenant: 5000,
  slowQueryMs: 100,
  nPlusOneThreshold: 5,
};

interface EntryBody {
  kind: string;
  label: string;
}

async function bootApp(
  settings: DevDashboardSettings,
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DEV_DASHBOARD_SETTINGS)
    .useValue(settings)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();

  return app;
}

function entry(
  tenantId: string,
  overrides: Partial<NewDevDashboardEntry> = {},
): NewDevDashboardEntry {
  return {
    tenantId,
    kind: 'slow-query',
    label: 'SELECT ?',
    status: null,
    durationMs: 300,
    requestId: null,
    detail: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('dev dashboard routes', () => {
  let app: INestApplication<App>;
  let user: TestUser;
  let tenantId: string;
  let store: DevDashboardStore;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    app = await bootApp(ENABLED);
    user = await registerAndLogin(app);
    store = app.get(DevDashboardStore);
    tenantId = (
      await authPrismaClient.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { tenantId: true },
      })
    ).tenantId;
    await store.clear(tenantId);
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await store.clear(tenantId);
    await store.clear('http-spec-foreign');
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a caller with no session', async () => {
    await request(app.getHttpServer()).get('/devtools/entries').expect(401);
  });

  it("lists the caller's tenant and never another's", async () => {
    await store.insertMany([
      entry(tenantId, { label: 'mine' }),
      entry('http-spec-foreign', { label: 'theirs' }),
    ]);

    const response = await request(app.getHttpServer())
      .get('/devtools/entries')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const body = response.body as {
      data: EntryBody[];
      meta: { total: number };
    };

    expect(body.data.map((row) => row.label)).toEqual(['mine']);
    expect(body.meta.total).toBe(1);
  });

  it('filters by kind and rejects an unknown one', async () => {
    await store.insertMany([
      entry(tenantId, { kind: 'exception', label: 'Error: boom' }),
      entry(tenantId, { kind: 'slow-query' }),
    ]);

    const filtered = await request(app.getHttpServer())
      .get('/devtools/entries?kind=exception')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect((filtered.body as { data: EntryBody[] }).data).toHaveLength(1);

    await request(app.getHttpServer())
      .get('/devtools/entries?kind=nonsense')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
  });

  it('summarises the counts per kind', async () => {
    await store.insertMany([entry(tenantId), entry(tenantId)]);

    const response = await request(app.getHttpServer())
      .get('/devtools/summary')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(
      (response.body as { data: Record<string, number> }).data,
    ).toMatchObject({
      'slow-query': 2,
      request: 0,
    });
  });

  it("clears the caller's tenant only", async () => {
    await store.insertMany([entry(tenantId), entry('http-spec-foreign')]);

    await request(app.getHttpServer())
      .delete('/devtools/entries')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(await store.summary(tenantId)).toMatchObject({ 'slow-query': 0 });
    expect(await store.summary('http-spec-foreign')).toMatchObject({
      'slow-query': 1,
    });
  });

  it('records a real request under the tenant that made it', async () => {
    await request(app.getHttpServer())
      .get('/introspect')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    await app.get(DevDashboardRecorder).flush();

    const response = await request(app.getHttpServer())
      .get('/devtools/entries?kind=request')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(
      (response.body as { data: EntryBody[] }).data.map((row) => row.label),
    ).toContain('GET /introspect');
  });

  it('does not record its own reads', async () => {
    await request(app.getHttpServer())
      .get('/devtools/summary')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    await app.get(DevDashboardRecorder).flush();

    expect((await store.summary(tenantId)).request).toBe(0);
  });

  it('asks for the admin capability in production', async () => {
    process.env.NODE_ENV = 'production';

    await request(app.getHttpServer())
      .get('/devtools/entries')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    await authPrismaClient.user.update({
      where: { id: user.id },
      data: { role: 'admin' },
    });

    try {
      await request(app.getHttpServer())
        .get('/devtools/entries')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
    } finally {
      await authPrismaClient.user.update({
        where: { id: user.id },
        data: { role: 'user' },
      });
    }
  });
});

describe('dev dashboard routes when recording is off', () => {
  let app: INestApplication<App>;
  let user: TestUser;

  beforeAll(async () => {
    app = await bootApp({ ...ENABLED, isEnabled: false });
    user = await registerAndLogin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not exist', async () => {
    await request(app.getHttpServer())
      .get('/devtools/entries')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });
});
