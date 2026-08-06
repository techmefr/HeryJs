import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';

/**
 * Both routes used to answer anyone who asked. /health names the database and
 * the queue and quotes their failure messages verbatim; /metrics carries every
 * route of the application with its request counts. This proves they are now
 * caller-authenticated, and that a probe with no session can still reach them
 * the way a non-interactive caller is meant to: with an API key.
 */
describe('Monitoring routes', () => {
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

  const promoteToAdmin = (userId: string) =>
    authPrismaClient.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });

  it('refuses an anonymous caller on /health and /metrics', async () => {
    await request(app.getHttpServer()).get('/health').expect(401);
    await request(app.getHttpServer()).get('/metrics').expect(401);
  });

  it('refuses a signed-in caller who is not an admin', async () => {
    const caller = await registerAndLogin(app);

    await request(app.getHttpServer())
      .get('/health')
      .set('Authorization', `Bearer ${caller.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${caller.token}`)
      .expect(403);
  });

  it('answers an admin session', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const health = await request(app.getHttpServer())
      .get('/health')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect((health.body as { status: string }).status).toBe('ok');
  });

  it('answers a scrape carrying an API key', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const created = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'prometheus' })
      .expect(201);
    const { key } = (created.body as { data: { key: string } }).data;

    const metrics = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);

    expect(metrics.text).toContain('http_requests_total');
  });
});
