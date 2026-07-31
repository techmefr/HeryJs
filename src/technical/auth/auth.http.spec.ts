import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  INestApplication,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from './auth.module';
import { SessionGuard } from './session.guard';
import type { RequestWithUser } from './session.guard';

@Controller('protected')
class ProtectedController {
  @Get()
  @UseGuards(SessionGuard)
  read(@Req() req: RequestWithUser) {
    return { userId: req.user.id };
  }
}

describe('auth over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const email = `${randomUUID()}@example.test`;
  const password = 'correct-horse-battery-staple';

  it('rejects a protected route without a session', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);
  });

  it('registers, logs in, and reaches a protected route with the session token', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const token = (loginResponse.body as { data: { token: string } }).data
      .token;
    expect(token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  describe('API keys', () => {
    let sessionToken: string;

    beforeAll(async () => {
      const keyEmail = `${randomUUID()}@example.test`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: keyEmail, password })
        .expect(201);
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: keyEmail, password })
        .expect(201);
      sessionToken = (loginResponse.body as { data: { token: string } }).data
        .token;
    });

    it('reaches a protected route with a freshly created API key', async () => {
      const created = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ name: 'ci-script' })
        .expect(201);
      const key = (created.body as { data: { key: string } }).data.key;
      expect(key).toEqual(expect.stringContaining('hery_ak_'));

      await request(app.getHttpServer())
        .get('/protected')
        .set('Authorization', `Bearer ${key}`)
        .expect(200);
    });

    it('never shows the raw key again once listed', async () => {
      const list = await request(app.getHttpServer())
        .get('/api-keys')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      const keys = (list.body as { data: { name: string }[] }).data;
      expect(keys.some((entry) => entry.name === 'ci-script')).toBe(true);
      expect(JSON.stringify(list.body)).not.toContain('hery_ak_');
    });

    it('rejects a revoked API key', async () => {
      const created = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ name: 'throwaway' })
        .expect(201);
      const { id, key } = (
        created.body as { data: { id: string; key: string } }
      ).data;

      await request(app.getHttpServer())
        .delete(`/api-keys/${id}`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/protected')
        .set('Authorization', `Bearer ${key}`)
        .expect(401);
    });

    it('rejects a garbage API key', async () => {
      await request(app.getHttpServer())
        .get('/protected')
        .set('Authorization', 'Bearer hery_ak_nonexistent.secret')
        .expect(401);
    });
  });
});
