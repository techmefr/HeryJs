import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import {
  clearPlatformOperators,
  grantPlatformOperator,
} from '#devtools/testing/platform-operator';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import { createTestTenantId } from '#devtools/testing/tenant-isolation';

interface FlagRow {
  key: string;
  tenantId: string | null;
}

describe('feature flags and global state, tenant admin against platform operator', () => {
  let app: INestApplication<App>;
  let operator: TestUser;
  let adminA: TestUser;
  const tenantA = createTestTenantId();
  const tenantB = createTestTenantId();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    operator = await registerAndLogin(app);
    grantPlatformOperator(operator.id);

    adminA = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: adminA.id },
      data: { role: 'admin', tenantId: tenantA },
    });
  });

  afterAll(async () => {
    clearPlatformOperators();
    await authPrismaClient.featureFlag.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await app.close();
  });

  const as = (user: TestUser) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${user.token}`),
    post: (url: string, body: Record<string, unknown> = {}) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    put: (url: string, body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .put(url)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    patch: (url: string, body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${user.token}`),
  });

  const rowsOf = (response: request.Response) =>
    (response.body as { data: FlagRow[] }).data;

  it('refuses a tenant admin on a global flag and on another tenant flag', async () => {
    const key = `flag-${randomUUID()}`;

    await as(operator)
      .patch(`/feature-flags/${key}`, { enabled: true, tenantId: tenantB })
      .expect(200);

    await as(adminA)
      .patch(`/feature-flags/${key}`, { enabled: false, tenantId: null })
      .expect(403);
    await as(adminA)
      .patch(`/feature-flags/${key}`, { enabled: false, tenantId: tenantB })
      .expect(403);
    await as(adminA)
      .delete(`/feature-flags/${key}?tenantId=${tenantB}`)
      .expect(403);
    await as(adminA)
      .post('/feature-flags/evaluate', { key, tenantId: tenantB })
      .expect(403);

    const listed = rowsOf(
      await as(adminA).get('/feature-flags?perPage=100').expect(200),
    );
    expect(listed.filter((row) => row.tenantId !== tenantA)).toEqual([]);

    const seen = rowsOf(
      await as(operator).get('/feature-flags?perPage=100').expect(200),
    );
    expect(seen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key, tenantId: tenantB }),
      ]),
    );
  });

  it('lets a tenant admin manage the flags of its own tenant', async () => {
    const key = `flag-${randomUUID()}`;

    const created = await as(adminA)
      .patch(`/feature-flags/${key}`, { enabled: true })
      .expect(200);
    expect((created.body as { data: FlagRow }).data).toMatchObject({
      key,
      tenantId: tenantA,
    });

    await as(adminA)
      .patch(`/feature-flags/${key}`, { enabled: false, tenantId: tenantA })
      .expect(200);

    const listed = rowsOf(
      await as(adminA).get('/feature-flags?perPage=100').expect(200),
    );
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key, tenantId: tenantA }),
      ]),
    );

    await as(adminA).delete(`/feature-flags/${key}`).expect(200);
  });

  it('lets the operator manage a global flag', async () => {
    const key = `flag-${randomUUID()}`;

    const created = await as(operator)
      .patch(`/feature-flags/${key}`, { enabled: true })
      .expect(200);
    expect((created.body as { data: FlagRow }).data.tenantId).toBeNull();

    await as(operator).delete(`/feature-flags/${key}`).expect(200);
  });

  it('keeps the deployment-wide routes to the operator', async () => {
    for (const route of [
      '/backups',
      '/metrics',
      '/health',
      '/deployment',
      '/quotas/tenants',
    ]) {
      await as(adminA).get(route).expect(403);
    }

    await as(adminA)
      .put('/quotas/api-calls/override', { tenantId: tenantA, limit: 1 })
      .expect(403);
    await as(adminA)
      .post('/quotas/api-calls/reset', { tenantId: tenantB })
      .expect(403);

    await as(operator).get('/health').expect(200);
  });
});
