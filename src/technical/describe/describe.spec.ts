import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { BlogPostModule } from '../../../examples/blog-post/blog-post.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { DescribedController } from './describe.service';

describe('Resource description', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    token = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const describeAll = async (): Promise<DescribedController[]> => {
    const response = await request(app.getHttpServer())
      .get('/describe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return (response.body as { data: DescribedController[] }).data;
  };

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/describe').expect(401);
  });

  it('reports the routes actually registered on the router', async () => {
    const controllers = await describeAll();
    const paths = controllers.map((controller) => controller.basePath);

    expect(paths).toContain('/blog-posts');
    expect(paths).toContain('/describe');
  });

  it('names the capability guarding each route of a resource', async () => {
    const controllers = await describeAll();
    const blogPosts = controllers.find(
      (controller) => controller.basePath === '/blog-posts',
    );

    const capabilities = Object.fromEntries(
      (blogPosts?.routes ?? []).map((route) => [
        route.handler,
        route.capability,
      ]),
    );

    // An aliased policy (canViewX = canUpdateX) reports the name of the first
    // binding, which would claim a read route requires update rights.
    expect(capabilities).toMatchObject({
      search: 'canViewAnyBlogPost',
      create: 'canCreateBlogPost',
      update: 'canUpdateAnyBlogPost',
      remove: 'canDeleteAnyBlogPost',
      restore: 'canRestoreAnyBlogPost',
    });
  });

  it('leaves no resource route unguarded', async () => {
    const controllers = await describeAll();
    const blogPosts = controllers.find(
      (controller) => controller.basePath === '/blog-posts',
    );

    expect(blogPosts?.routes.every((route) => route.capability)).toBe(true);
  });
});
