import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function registerAndLogin(
  app: INestApplication<App>,
): Promise<TestUser> {
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

  const { data } = login.body as {
    data: { token: string; user: { id: string } };
  };

  return { id: data.user.id, email, token: data.token };
}
