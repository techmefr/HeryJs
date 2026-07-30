import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';

interface InspectedRequest {
  method: string;
  path: string;
  status: number;
}

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

  return (login.body as { data: { token: string } }).data.token;
}

describe('request inspector', () => {
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

  it('records both successful and guard-rejected requests', async () => {
    const token = await registerAndLogin(app);

    await request(app.getHttpServer())
      .get('/workouts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/workouts/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer()).get('/workouts').expect(401);

    const response = await request(app.getHttpServer())
      .get('/inspector/requests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const entries = (response.body as { data: InspectedRequest[] }).data;

    expect(entries).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/workouts',
        status: 200,
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/workouts/does-not-exist',
        status: 404,
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/workouts',
        status: 401,
      }),
    );
  });
});
