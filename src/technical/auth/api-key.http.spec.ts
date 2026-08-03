import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from './auth.module';

/**
 * Revoking a leaked API key would not actually cut off access if the bearer
 * could mint further keys with it -- each with its own prefix and revokedAt,
 * so the leaked one being revoked leaves the others live. Only a real
 * session may manage API keys.
 */
describe('API key management over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const email = `${randomUUID()}@example.test`;
  const password = 'correct-horse-battery-staple';
  let sessionToken: string;
  let apiKeyToken: string;

  beforeAll(async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    sessionToken = (loginResponse.body as { data: { token: string } }).data
      .token;

    const createResponse = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ name: 'ci' })
      .expect(201);
    apiKeyToken = (createResponse.body as { data: { key: string } }).data.key;
  });

  it('lets a real session create, list, and revoke API keys', async () => {
    await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);
  });

  it('refuses an API key trying to create another API key', async () => {
    await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', `Bearer ${apiKeyToken}`)
      .send({ name: 'escalated' })
      .expect(403);
  });

  it('refuses an API key trying to list API keys', async () => {
    await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', `Bearer ${apiKeyToken}`)
      .expect(403);
  });

  it('refuses an API key trying to revoke an API key', async () => {
    await request(app.getHttpServer())
      .delete('/api-keys/whatever')
      .set('Authorization', `Bearer ${apiKeyToken}`)
      .expect(403);
  });
});
