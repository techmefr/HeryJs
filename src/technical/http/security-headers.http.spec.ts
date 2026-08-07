import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';

describe('security headers', () => {
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

  it('answers with a policy that allows no script and no framing', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.headers['content-security-policy']).toContain(
      "script-src 'none'",
    );
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('leaves the development queue dashboard to its own scripts', async () => {
    const response = await request(app.getHttpServer()).get('/jobs/queues');

    expect(response.headers['content-security-policy']).toBeUndefined();
  });

  it('sets them on an error response too, not only on a handled one', async () => {
    const response = await request(app.getHttpServer())
      .get('/does-not-exist')
      .expect(404);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
  });
});
