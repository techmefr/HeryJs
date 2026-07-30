import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { WorkoutModule } from './workout.module';
import { env } from '../../src/technical/config/env';
import { registerAndLogin } from '../../src/devtools/testing/register-and-login';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

describe('Workout resource (full vertical slice)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, WorkoutModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ownerToken = (await registerAndLogin(app)).token;
    strangerToken = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates a workout owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Leg day' })
      .expect(201);

    expect(
      (response.body as { data: { tenantId: string } }).data.tenantId,
    ).toBe('default');
  });

  it('keeps a workout out of the list for anyone who cannot open it directly', async () => {
    const created = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Private session' })
      .expect(201);

    const workoutId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .get(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/workouts')
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(200);

    expect(
      (list.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(workoutId);
  });

  it('keeps a trashed workout out of the bin of anyone who cannot open it', async () => {
    const created = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Session to trash' })
      .expect(201);

    const workoutId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const bin = await request(app.getHttpServer())
      .get('/workouts?onlyTrashed=true')
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(200);

    expect(
      (bin.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(workoutId);
  });

  it('lists workouts with resolved capabilities via ?include=capabilities', async () => {
    const response = await request(app.getHttpServer())
      .get('/workouts?include=capabilities')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: { update: { allowed: boolean } } }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.capabilities.update.allowed).toBe(true);
    expect(body.meta).toEqual({
      capabilities: { create: { allowed: true, scope: 'own' } },
      channels: ['workout'],
    });
  });

  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owned by someone else' })
      .expect(201);

    const workoutId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .patch(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ title: 'Hijacked' })
      .expect(403);
  });

  it('soft-deletes then restores a workout', async () => {
    const created = await request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'To be deleted' })
      .expect(201);

    const workoutId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/workouts/${workoutId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it('never lets a different tenant see this tenant workouts', async () => {
    const outsider = await registerAndLogin(app);
    await prisma.user.update({
      where: { email: outsider.email },
      data: { tenantId: `tenant-${randomUUID()}` },
    });

    const response = await request(app.getHttpServer())
      .get('/workouts')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });

  it('cannot be spoofed into another tenant via a client-supplied header', async () => {
    const response = await request(app.getHttpServer())
      .get('/workouts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', `tenant-${randomUUID()}`)
      .expect(200);

    expect(
      (response.body as { data: Array<{ tenantId: string }> }).data.every(
        (workout) => workout.tenantId === 'default',
      ),
    ).toBe(true);
  });
});
