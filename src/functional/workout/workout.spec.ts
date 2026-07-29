import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';

const TENANT_ID = `tenant-${randomUUID()}`;

async function registerAndLogin(app: INestApplication<App>) {
  const email = `${randomUUID()}@example.test`;
  const password = 'correct-horse-battery-staple';

  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(201);

  return (login.body as { token: string }).token;
}

describe('Workout resource (full vertical slice)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ownerToken = await registerAndLogin(app);
    strangerToken = await registerAndLogin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a workout owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .send({ title: 'Leg day' })
      .expect(201);

    expect(
      (response.body as { data: { tenantId: string } }).data.tenantId,
    ).toBe(TENANT_ID);
  });

  it('lists workouts with resolved capabilities via ?include=capabilities', async () => {
    const response = await request(app.getHttpServer())
      .get('/workouts?include=capabilities')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: { update: { allowed: boolean } } }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].capabilities.update.allowed).toBe(true);
    expect(body.meta).toEqual({
      capabilities: { create: { allowed: true, scope: 'own' } },
    });
  });

  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .send({ title: 'Owned by someone else' })
      .expect(201);

    const workoutId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .patch(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .send({ title: 'Hijacked' })
      .expect(403);
  });

  it('soft-deletes then restores a workout', async () => {
    const created = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .send({ title: 'To be deleted' })
      .expect(201);

    const workoutId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/workouts/${workoutId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TENANT_ID)
      .expect(200);
  });

  it('never lets a different tenant see this tenant workouts', async () => {
    const otherTenantId = `tenant-${randomUUID()}`;

    const response = await request(app.getHttpServer())
      .get('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', otherTenantId)
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });
});
