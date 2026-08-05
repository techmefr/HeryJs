import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { BlogPostModule } from '../../../examples/blog-post/blog-post.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';

interface InspectedRequest {
  method: string;
  path: string;
  status: number;
}

describe('request inspector', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('records both successful and guard-rejected requests', async () => {
    const { token } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .get('/blog-posts/describe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/blog-posts/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer()).get('/blog-posts/describe').expect(401);

    const response = await request(app.getHttpServer())
      .get('/inspector/requests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const entries = (response.body as { data: InspectedRequest[] }).data;

    expect(entries).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/blog-posts/describe',
        status: 200,
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/blog-posts/does-not-exist',
        status: 404,
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/blog-posts/describe',
        status: 401,
      }),
    );
  });
});
