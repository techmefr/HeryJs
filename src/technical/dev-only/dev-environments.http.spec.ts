import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { heryConfig } from '#technical/config/hery-config';

describe('devTools.environments decides where the dev routes exist', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let member: TestUser;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevTools = heryConfig.devTools;

  const restore = () => {
    process.env.NODE_ENV = originalNodeEnv;
    heryConfig.devTools = originalDevTools;
  };

  const seeders = (user: TestUser) =>
    request(app.getHttpServer())
      .get('/seeders')
      .set('Authorization', `Bearer ${user.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    member = await registerAndLogin(app);
  });

  afterEach(restore);

  afterAll(async () => {
    restore();
    await app.close();
  });

  it('opens them for any signed-in developer under the default list', async () => {
    heryConfig.devTools = undefined;
    process.env.NODE_ENV = 'development';

    await request(app.getHttpServer()).post('/auth/dev-token').expect(201);
    await seeders(member).expect(200);
  });

  it('404s them when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV;

    await request(app.getHttpServer()).post('/auth/dev-token').expect(404);
    await seeders(admin).expect(404);
  });

  it('404s them under a demo that is not listed', async () => {
    process.env.NODE_ENV = 'demo';

    await request(app.getHttpServer()).post('/auth/dev-token').expect(404);
    await seeders(admin).expect(404);
  });

  it('opens them under a listed demo, with the seeders kept to an admin', async () => {
    heryConfig.devTools = { environments: ['development', 'test', 'demo'] };
    process.env.NODE_ENV = 'demo';

    await request(app.getHttpServer()).post('/auth/dev-token').expect(201);
    await seeders(admin).expect(200);
    await seeders(member).expect(403);
    await request(app.getHttpServer()).get('/seeders').expect(401);
  });
});
