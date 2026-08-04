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
import { WorkoutModule } from '../../../examples/workout/workout.module';

interface PruneStatus {
  model: string;
  retentionDays: number;
  lock: boolean;
}

describe('prune', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, WorkoutModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    adminToken = admin.token;

    userToken = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a non-admin caller on both routes', async () => {
    await request(app.getHttpServer())
      .get('/prune')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/prune/Workout/run')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it("lists Workout with the project's configured retention", async () => {
    const response = await request(app.getHttpServer())
      .get('/prune')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const status = (response.body as { data: PruneStatus[] }).data;

    expect(status).toContainEqual({
      model: 'Workout',
      retentionDays: 30,
      lock: false,
    });
  });

  it('refuses a model that carries no prune configuration', async () => {
    await request(app.getHttpServer())
      .post('/prune/User/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('hard-deletes rows soft-deleted longer ago than the retention window, and leaves recent ones alone', async () => {
    const create = (title: string) =>
      request(app.getHttpServer())
        .post('/workouts/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ data: [{ title }] })
        .expect(201)
        .then(
          (response) =>
            (response.body as { data: { id: string }[] }).data[0]!.id,
        );

    const overdueId = await create('overdue');
    const recentId = await create('recent');

    const overdue = new Date();
    overdue.setDate(overdue.getDate() - 31);

    await authPrismaClient.workout.update({
      where: { id: overdueId },
      data: { deletedAt: overdue },
    });
    await authPrismaClient.workout.update({
      where: { id: recentId },
      data: { deletedAt: new Date() },
    });

    const response = await request(app.getHttpServer())
      .post('/prune/Workout/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const result = (response.body as { data: { deletedCount: number } }).data;
    expect(result.deletedCount).toBeGreaterThanOrEqual(1);

    expect(
      await authPrismaClient.workout.findUnique({ where: { id: overdueId } }),
    ).toBeNull();
    expect(
      await authPrismaClient.workout.findUnique({ where: { id: recentId } }),
    ).not.toBeNull();

    const entry = await authPrismaClient.auditLog.findFirst({
      where: { tenantId: 'default', model: 'Workout', operation: 'prune' },
      orderBy: { createdAt: 'desc' },
    });

    expect(entry?.userId).toBe(admin.id);
    expect((entry?.data as { count?: number } | null)?.count).toBe(
      result.deletedCount,
    );
  });
});
