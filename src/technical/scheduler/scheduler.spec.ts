import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';

interface ScheduledTaskRun {
  name: string;
  status: string;
}

describe('scheduler', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a registered cron job and records the run', async () => {
    const registry = app.get(SchedulerRegistry);
    await registry.getCronJob('heartbeat').fireOnTick();

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

    const token = (login.body as { data: { token: string } }).data.token;

    const response = await request(app.getHttpServer())
      .get('/scheduler/tasks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const tasks = (response.body as { data: ScheduledTaskRun[] }).data;

    expect(tasks).toContainEqual(
      expect.objectContaining({ name: 'heartbeat', status: 'success' }),
    );
  });
});
