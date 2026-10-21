import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { env } from '#technical/config/env';

interface Listed {
  data: Array<Record<string, unknown> & { id: string }>;
}

describe('the studio users and access sections', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let member: TestUser;
  let outsider: { userId: string; sessionId: string; keyId: string };
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = env as unknown as Record<string, string | undefined>;
  const originalEnabled = mutableEnv.ADMIN_STUDIO_ENABLED;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    member = await registerAndLogin(app);

    const user = await authPrismaClient.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@elsewhere.test`,
        tenantId: `other-tenant-${randomUUID()}`,
      },
    });
    const session = await authPrismaClient.session.create({
      data: {
        token: randomBytes(16).toString('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const key = await authPrismaClient.apiKey.create({
      data: {
        userId: user.id,
        name: 'outsider key',
        prefix: randomBytes(6).toString('base64url'),
        hashedKey: randomBytes(32).toString('hex'),
      },
    });
    outsider = { userId: user.id, sessionId: session.id, keyId: key.id };
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    mutableEnv.ADMIN_STUDIO_ENABLED = originalEnabled;
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (user: TestUser, route: string) =>
    request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${user.token}`);
  const post = (user: TestUser, route: string) =>
    request(app.getHttpServer())
      .post(route)
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

  const listRoutes = [
    '/studio/access/users',
    '/studio/access/sessions',
    '/studio/access/api-keys',
    '/studio/overview/health',
    '/studio/overview/scheduler',
    '/studio/overview/environment',
  ];

  it('refuses a member who is not an admin, on every list and action', async () => {
    for (const route of listRoutes) {
      await get(member, route).expect(403);
    }

    await post(member, `/studio/access/users/${admin.id}/sign-out`).expect(403);
    await post(member, `/studio/access/api-keys/${randomUUID()}/revoke`).expect(
      403,
    );
  });

  it('is a 404 in production until the studio is switched on', async () => {
    process.env.NODE_ENV = 'production';
    mutableEnv.ADMIN_STUDIO_ENABLED = 'false';

    for (const route of listRoutes) {
      await get(admin, route).expect(404);
    }

    mutableEnv.ADMIN_STUDIO_ENABLED = 'true';

    for (const route of listRoutes) {
      await get(admin, route).expect(200);
    }
  });

  it('lists the users of the caller tenant only, with their 2FA state and no secret', async () => {
    const response = await get(admin, '/studio/access/users?perPage=100');
    const users = (response.body as Listed).data;
    const ids = users.map((user) => user.id);

    expect(ids).toEqual(expect.arrayContaining([admin.id, member.id]));
    expect(ids).not.toContain(outsider.userId);
    expect(users.find((user) => user.id === member.id)).toMatchObject({
      twoFactorEnabled: false,
      activeSessions: await authPrismaClient.session.count({
        where: { userId: member.id },
      }),
      activeApiKeys: 0,
    });
    for (const user of users) {
      expect(user).not.toHaveProperty('password');
    }
  });

  it('lists sessions and keys without tokens or hashes, and none of another tenant', async () => {
    const created = await post(admin, '/api-keys')
      .send({ name: 'ci' })
      .expect(201);
    const keyId = (created.body as { data: { id: string } }).data.id;

    const sessions = (
      (await get(admin, '/studio/access/sessions?perPage=100').expect(200))
        .body as Listed
    ).data;
    const keys = (
      (await get(admin, '/studio/access/api-keys?perPage=100').expect(200))
        .body as Listed
    ).data;

    expect(sessions.map((s) => s.id)).not.toContain(outsider.sessionId);
    expect(keys.map((k) => k.id)).toContain(keyId);
    expect(keys.map((k) => k.id)).not.toContain(outsider.keyId);
    expect(JSON.stringify(sessions)).not.toContain(admin.token.split('.')[0]);
    for (const row of [...sessions, ...keys]) {
      expect(row).not.toHaveProperty('token');
      expect(row).not.toHaveProperty('hashedKey');
    }
  });

  it('cannot reach a session, key or user of another tenant', async () => {
    await post(
      admin,
      `/studio/access/sessions/${outsider.sessionId}/revoke`,
    ).expect(404);
    await post(
      admin,
      `/studio/access/api-keys/${outsider.keyId}/revoke`,
    ).expect(404);
    await post(
      admin,
      `/studio/access/users/${outsider.userId}/sign-out`,
    ).expect(404);

    await expect(
      authPrismaClient.session.findUnique({
        where: { id: outsider.sessionId },
      }),
    ).resolves.not.toBeNull();
    await expect(
      authPrismaClient.apiKey.findUnique({ where: { id: outsider.keyId } }),
    ).resolves.toMatchObject({ revokedAt: null });
  });

  it('signs a user out everywhere, refuses the old token, and audits the action', async () => {
    const target = await registerAndLogin(app);

    await post(admin, `/studio/access/users/${target.id}/sign-out`).expect(201);
    await get(target, '/auth/sessions').expect(401);

    await expect(
      authPrismaClient.auditLog.count({
        where: {
          model: 'AdminAction',
          operation: 'studio-user-sign-out',
          recordId: target.id,
          userId: admin.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('revokes one session and one key of the tenant', async () => {
    const target = await registerAndLogin(app);
    const created = await post(target, '/api-keys')
      .send({ name: 'script' })
      .expect(201);
    const key = (created.body as { data: { id: string; key: string } }).data;
    const session = await authPrismaClient.session.findFirstOrThrow({
      where: { token: target.token.split('.')[0] },
    });

    await post(admin, `/studio/access/sessions/${session.id}/revoke`).expect(
      201,
    );
    await post(admin, `/studio/access/api-keys/${key.id}/revoke`).expect(201);

    await get(target, '/auth/sessions').expect(401);
    await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${key.key}`)
      .expect(401);
  });

  it('reports health, scheduled runs and the environment without a secret', async () => {
    const health = (
      (await get(admin, '/studio/overview/health').expect(200)).body as Listed
    ).data;
    expect(health).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database', probe: 'readiness' }),
      ]),
    );

    const environment = (
      (await get(admin, '/studio/overview/environment').expect(200))
        .body as Listed
    ).data;
    const text = JSON.stringify(environment);
    expect(text).not.toContain(process.env.DATABASE_URL ?? 'no-database-url');
    expect(text).not.toContain(
      process.env.BETTER_AUTH_SECRET ?? 'no-auth-secret',
    );
  });
});
