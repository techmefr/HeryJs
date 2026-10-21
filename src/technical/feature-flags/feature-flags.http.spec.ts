import { randomUUID } from 'node:crypto';
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

interface Evaluation {
  enabled: boolean;
  reason: string;
  ruleIndex?: number;
  bucket?: number;
}

describe('feature flags over HTTP', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let member: TestUser;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const patch = (key: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/feature-flags/${key}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);

  const evaluate = async (
    key: string,
    context: Record<string, unknown>,
  ): Promise<Evaluation> => {
    const response = await request(app.getHttpServer())
      .post('/feature-flags/evaluate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ key, ...context })
      .expect(201);

    return (response.body as { data: Evaluation }).data;
  };

  const evaluateEach = async (
    key: string,
    users: string[],
  ): Promise<Evaluation[]> => {
    const answers: Evaluation[] = [];

    for (const userId of users) {
      answers.push(await evaluate(key, { userId }));
    }

    return answers;
  };

  it('refuses a non-admin caller on every route', async () => {
    const key = `flag-${randomUUID()}`;
    const auth = `Bearer ${member.token}`;

    await request(app.getHttpServer())
      .get('/feature-flags')
      .set('Authorization', auth)
      .expect(403);
    await request(app.getHttpServer())
      .post('/feature-flags/evaluate')
      .set('Authorization', auth)
      .send({ key })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/feature-flags/${key}`)
      .set('Authorization', auth)
      .send({ enabled: true })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/feature-flags/${key}`)
      .set('Authorization', auth)
      .expect(403);
  });

  it('rejects an out-of-range percentage and a malformed rule', async () => {
    const key = `flag-${randomUUID()}`;

    await patch(key, { rolloutPercentage: 150 }).expect(400);
    await patch(key, { rolloutPercentage: 12.5 }).expect(400);
    await patch(key, {
      rules: [{ attribute: 'plan', operator: 'in', values: [], serve: true }],
    }).expect(400);
  });

  it('keeps a flag created the old way on for everyone', async () => {
    const key = `flag-${randomUUID()}`;
    const created = await patch(key, { enabled: true }).expect(200);

    expect(
      (
        created.body as {
          data: { rolloutPercentage: number; rules: unknown[] };
        }
      ).data,
    ).toMatchObject({ rolloutPercentage: 100, rules: [] });
    await expect(evaluate(key, {})).resolves.toMatchObject({
      enabled: true,
      reason: 'everyone',
    });
  });

  it('rolls out to a stable share of users and applies a raised percentage at once', async () => {
    const key = `flag-${randomUUID()}`;
    const users = Array.from({ length: 25 }, (_, index) => `user-${index}`);

    await patch(key, { enabled: true, rolloutPercentage: 50 }).expect(200);

    const first = await evaluateEach(key, users);
    const second = await evaluateEach(key, users);

    expect(second).toEqual(first);
    expect(first.some((entry) => entry.enabled)).toBe(true);
    expect(first.some((entry) => !entry.enabled)).toBe(true);

    await patch(key, { rolloutPercentage: 100 }).expect(200);

    const raised = await evaluateEach(key, users);

    expect(raised.every((entry) => entry.enabled)).toBe(true);
  });

  it('lets a targeting rule override the rollout, and a patch of one field keeps the others', async () => {
    const key = `flag-${randomUUID()}`;

    await patch(key, {
      enabled: true,
      rolloutPercentage: 0,
      rules: [
        { attribute: 'plan', operator: 'in', values: ['pro'], serve: true },
      ],
    }).expect(200);
    await patch(key, { rolloutBy: 'tenant' }).expect(200);

    await expect(evaluate(key, { plan: 'pro' })).resolves.toMatchObject({
      enabled: true,
      reason: 'rule',
      ruleIndex: 0,
    });
    await expect(
      evaluate(key, { plan: 'free', tenantId: 't-free' }),
    ).resolves.toMatchObject({
      enabled: false,
      reason: 'rollout',
    });
  });

  it('turns a flag off at runtime with the kill switch', async () => {
    const key = `flag-${randomUUID()}`;

    await patch(key, { enabled: true }).expect(200);
    await patch(key, { enabled: false }).expect(200);

    await expect(evaluate(key, { userId: 'u' })).resolves.toMatchObject({
      enabled: false,
      reason: 'disabled',
    });
  });

  it('lets a tenant override replace the global flag, then removes it', async () => {
    const key = `flag-${randomUUID()}`;
    const tenantId = `tenant-${randomUUID()}`;

    await patch(key, { enabled: true }).expect(200);
    await patch(key, { enabled: false, tenantId }).expect(200);

    await expect(evaluate(key, { tenantId })).resolves.toMatchObject({
      enabled: false,
    });
    await expect(evaluate(key, { tenantId: 'other' })).resolves.toMatchObject({
      enabled: true,
    });

    await request(app.getHttpServer())
      .delete(`/feature-flags/${key}`)
      .query({ tenantId })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    await expect(evaluate(key, { tenantId })).resolves.toMatchObject({
      enabled: true,
    });
    await request(app.getHttpServer())
      .delete(`/feature-flags/${key}`)
      .query({ tenantId })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);
  });

  it('reports a flag that does not exist as off rather than failing', async () => {
    await expect(
      evaluate(`missing-${randomUUID()}`, { userId: 'u' }),
    ).resolves.toEqual({ enabled: false, reason: 'not-found' });
  });
});
