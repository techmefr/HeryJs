import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { env } from '#technical/config/env';
import { AuthModule } from '#technical/auth/auth.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import type { DescribedController } from '#technical/introspection/introspection.service';
import { AdminAction, AdminSection } from './admin-metadata';
import { AdminStudio } from './admin-studio.guard';
import { canUseAdminStudio } from './admin-studio.policy';

@Controller('probe-studio')
@AdminStudio()
class ProbeStudioController {
  @AdminSection({
    id: 'probe',
    title: 'Probe',
    icon: 'box',
    group: 'Testing',
    columns: [{ key: 'name', label: 'Name' }],
  })
  @Get()
  @Capability(canUseAdminStudio)
  list() {
    return ok([{ id: 'one', name: 'First' }]);
  }

  @AdminAction({
    id: 'probe-run',
    title: 'Run',
    icon: 'zap',
    section: 'probe',
    scope: 'row',
    fields: [{ name: 'secret', label: 'Secret', type: 'password' }],
  })
  @Post(':id/run')
  @Capability(canUseAdminStudio)
  run(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok({ id, received: Object.keys(body) });
  }
}

@Module({ imports: [AuthModule], controllers: [ProbeStudioController] })
class ProbeStudioModule {}

describe('the admin studio in production', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let member: TestUser;
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = env as unknown as Record<string, string | undefined>;
  const names = [
    'ADMIN_STUDIO_ENABLED',
    'ADMIN_STUDIO_ALLOWED_IPS',
    'ADMIN_STUDIO_REQUIRE_2FA',
  ];
  const savedEnv = Object.fromEntries(names.map((n) => [n, mutableEnv[n]]));
  const restore = () => {
    process.env.NODE_ENV = originalNodeEnv;
    for (const name of names) {
      mutableEnv[name] = savedEnv[name];
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbeStudioModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    member = await registerAndLogin(app);
  });

  afterAll(async () => {
    restore();
    await app.close();
  });

  afterEach(restore);

  const production = (extra: Record<string, string> = {}) => {
    restore();
    process.env.NODE_ENV = 'production';
    mutableEnv.ADMIN_STUDIO_ENABLED = 'true';
    Object.assign(mutableEnv, extra);
  };
  const as = (user: TestUser, route: string) =>
    request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${user.token}`);

  const studioRoutes: Array<[string, string]> = [
    ['GET', '/introspect'],
    ['GET', '/probe-studio'],
    ['POST', '/probe-studio/one/run'],
  ];

  const call = (user: TestUser | null, method: string, route: string) => {
    const agent = request(app.getHttpServer());
    const pending =
      method === 'GET' ? agent.get(route) : agent.post(route).send({});

    return user
      ? pending.set('Authorization', `Bearer ${user.token}`)
      : pending;
  };

  it('stays unreachable until an operator switches it on, even for an admin', async () => {
    production({ ADMIN_STUDIO_ENABLED: 'false' });

    for (const [method, route] of studioRoutes) {
      await call(admin, method, route).expect(404);
    }
  });

  it('answers 404 rather than 401 to a caller who is not signed in', async () => {
    production({ ADMIN_STUDIO_ENABLED: 'false' });

    await call(null, 'GET', '/introspect').expect(404);

    production();

    await call(null, 'GET', '/introspect').expect(401);
  });

  it('refuses a non-admin with 403 on every studio route', async () => {
    production();

    for (const [method, route] of studioRoutes) {
      await call(member, method, route).expect(403);
    }
  });

  it('serves the platform admin, with the contributions each route declared', async () => {
    production();

    const response = await as(admin, '/introspect').expect(200);
    const controllers = (response.body as { data: DescribedController[] }).data;
    const probe = controllers.find(
      (controller) => controller.basePath === '/probe-studio',
    );

    const list = probe?.routes.find((route) => route.handler === 'list');
    const run = probe?.routes.find((route) => route.handler === 'run');

    expect(list?.capability).toBe('canUseAdminStudio');
    expect(list?.admin).toMatchObject({ kind: 'section', id: 'probe' });
    expect(run?.admin).toMatchObject({
      kind: 'action',
      id: 'probe-run',
      section: 'probe',
    });
  });

  it('cannot be bypassed by a dev header or a client-supplied environment', async () => {
    production({ ADMIN_STUDIO_ENABLED: 'false' });

    await request(app.getHttpServer())
      .get('/introspect')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('x-dev', 'true')
      .set('x-node-env', 'development')
      .set('x-admin-studio', 'enabled')
      .expect(404);

    production();

    await request(app.getHttpServer())
      .get('/introspect')
      .set('Authorization', `Bearer ${member.token}`)
      .set('x-dev', 'true')
      .set('x-node-env', 'development')
      .expect(403);
  });

  it('keeps the address allowlist closed to a spoofed forwarding header', async () => {
    production({ ADMIN_STUDIO_ALLOWED_IPS: '203.0.113.77' });

    await request(app.getHttpServer())
      .get('/introspect')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-Forwarded-For', '203.0.113.77')
      .expect(404);
  });

  it('requires an enrolled second factor when the operator asked for one', async () => {
    production({ ADMIN_STUDIO_REQUIRE_2FA: 'true' });

    await as(admin, '/introspect').expect(403);

    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { twoFactorEnabled: true },
    });

    await as(admin, '/introspect').expect(200);

    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { twoFactorEnabled: false },
    });
  });

  it('audits every admin action, with the field names and never the values', async () => {
    production();

    await call(admin, 'POST', '/probe-studio/one/run')
      .send({ secret: 'hunter2-do-not-log' })
      .expect(201);

    const entry = await authPrismaClient.auditLog.findFirst({
      where: { operation: 'probe-run', userId: admin.id },
    });

    expect(entry).toMatchObject({
      model: 'AdminAction',
      recordId: 'one',
      userId: admin.id,
      data: {
        method: 'POST',
        path: '/probe-studio/one/run',
        fields: ['secret'],
      },
    });
    expect(JSON.stringify(entry?.data)).not.toContain('hunter2');
  });

  it('writes no audit entry for an action the capability refused', async () => {
    production();

    await call(member, 'POST', '/probe-studio/one/run').expect(403);

    await expect(
      authPrismaClient.auditLog.count({
        where: { operation: 'probe-run', userId: member.id },
      }),
    ).resolves.toBe(0);
  });
});

describe('the admin studio outside production', () => {
  let app: INestApplication<App>;
  let member: TestUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbeStudioModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    member = await registerAndLogin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the development behaviour: any signed-in developer opens it', async () => {
    await request(app.getHttpServer())
      .get('/introspect')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200);
  });

  it('still refuses a caller who is not signed in', async () => {
    await request(app.getHttpServer()).get('/introspect').expect(401);
  });
});
