import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import { registerAndLogin } from '../testing/register-and-login';

describe('dev-only routes are unreachable in production', () => {
  let app: INestApplication<App>;
  let token: string;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ({ token } = await registerAndLogin(app));
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('serves dev-token and seeders routes outside production', async () => {
    await request(app.getHttpServer()).post('/auth/dev-token').expect(201);

    await request(app.getHttpServer())
      .get('/seeders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('404s dev-token, seeders list, and seeders run once NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';

    try {
      await request(app.getHttpServer()).post('/auth/dev-token').expect(404);

      await request(app.getHttpServer())
        .get('/seeders')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      await request(app.getHttpServer())
        .post('/seeders/anything/run')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
