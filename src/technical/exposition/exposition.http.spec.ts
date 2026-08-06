import { Injectable, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { ExposeAction, ExposeField } from './exposition.decorators';
import { ExpositionRunner } from './exposition-runner.service';

const allowEveryone: PolicyCheck = () => ({ allowed: true, scope: 'all' });
const allowNoOne: PolicyCheck = () => ({ allowed: false });

@Injectable()
class GreetingFixture {
  @ExposeAction('fixture.greet', { capability: allowEveryone })
  greet(
    @ExposeField('fixture.greet.times', {
      kind: 'number',
      min: 1,
      max: 5,
      default: 1,
    })
    times: number,
  ): string {
    return 'hi'.repeat(times);
  }

  @ExposeAction('fixture.blocked', { capability: allowNoOne })
  blocked(): string {
    return 'never';
  }

  @ExposeAction('fixture.prodOnly', {
    capability: allowEveryone,
    environments: ['production'],
  })
  prodOnly(): string {
    return 'prod only';
  }
}

describe('exposition', () => {
  let app: INestApplication<App>;
  let user: TestUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [GreetingFixture],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    user = await registerAndLogin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the fixture action with its params', async () => {
    const response = await request(app.getHttpServer())
      .get('/expose')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const catalog = (
      response.body as { data: { name: string; params: unknown[] }[] }
    ).data;

    expect(catalog).toContainEqual({
      name: 'fixture.greet',
      capability: 'allowEveryone',
      environments: undefined,
      params: [
        {
          name: 'fixture.greet.times',
          spec: { kind: 'number', min: 1, max: 5, default: 1 },
        },
      ],
    });
  });

  it('runs the action with its default when no param is given', async () => {
    const response = await request(app.getHttpServer())
      .post('/expose/fixture.greet')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);

    expect((response.body as { data: string }).data).toBe('hi');
  });

  it('runs the action with an overridden param', async () => {
    const response = await request(app.getHttpServer())
      .post('/expose/fixture.greet')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ 'fixture.greet.times': 3 })
      .expect(201);

    expect((response.body as { data: string }).data).toBe('hihihi');
  });

  it('rejects a param outside its declared bounds', async () => {
    await request(app.getHttpServer())
      .post('/expose/fixture.greet')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ 'fixture.greet.times': 99 })
      .expect(400);
  });

  it('refuses an action whose capability denies the caller', async () => {
    await request(app.getHttpServer())
      .post('/expose/fixture.blocked')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(403);
  });

  it('refuses an action outside its declared environment', async () => {
    await request(app.getHttpServer())
      .post('/expose/fixture.prodOnly')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(403);
  });

  it('404s an unknown action', async () => {
    await request(app.getHttpServer())
      .post('/expose/fixture.doesNotExist')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(404);
  });

  it('writes an audit entry recording the resolved params', async () => {
    await request(app.getHttpServer())
      .post('/expose/fixture.greet')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ 'fixture.greet.times': 2 })
      .expect(201);

    const entry = await authPrismaClient.auditLog.findFirst({
      where: {
        tenantId: 'default',
        model: 'exposition',
        operation: 'fixture.greet',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(entry?.userId).toBe(user.id);
    expect(entry?.data).toEqual({ 'fixture.greet.times': 2 });
  });

  it('runTrusted bypasses the capability check, the CLI path', async () => {
    const runner = app.get(ExpositionRunner, { strict: false });
    const tenantId = 'default';

    const result = await TenantContextStorage.run(
      { tenantId, userId: null, impersonatedBy: null },
      async () => await runner.runTrusted('fixture.blocked', {}),
    );

    expect(result).toBe('never');

    const entry = await authPrismaClient.auditLog.findFirst({
      where: { tenantId, model: 'exposition', operation: 'fixture.blocked' },
      orderBy: { createdAt: 'desc' },
    });

    expect(entry?.userId).toBeNull();
  });

  it('runTrusted still enforces the environment filter', async () => {
    const runner = app.get(ExpositionRunner, { strict: false });

    await expect(
      TenantContextStorage.run(
        { tenantId: 'default', userId: null, impersonatedBy: null },
        async () => await runner.runTrusted('fixture.prodOnly', {}),
      ),
    ).rejects.toThrow();
  });
});
