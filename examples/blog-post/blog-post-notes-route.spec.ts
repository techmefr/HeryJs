import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { BlogPostModule } from './blog-post.module';
import { env } from '#technical/config/env';
import { registerAndLogin } from '#devtools/testing/register-and-login';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * The generated blog-post.spec.ts never exercises `notes` past rejecting an
 * unknown relation name -- it is generic across every resource, so it has no
 * idea a `notes` route scoped to the parent exists at all. This file is that
 * missing coverage for the one blueprint feature (`ownRoute`) currently
 * exercised in examples/, kept by hand rather than generated because nothing
 * in the generator produces a test aware of a specific include's own route.
 */
describe('BlogPost notes route', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ownerToken = (await registerAndLogin(app)).token;
    strangerToken = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createBlogPost(token: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    return (
      response.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;
  }

  async function seedNotes(blogPostId: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await prisma.blogPostNote.create({
        data: {
          tenantId: 'default',
          blogPostId,
          body: `note-${index}`,
          rating: index,
        },
      });
    }
  }

  it('returns only the notes belonging to the parent named in the path', async () => {
    const ownBlogPostId = await createBlogPost(ownerToken);
    const otherBlogPostId = await createBlogPost(ownerToken);
    await seedNotes(ownBlogPostId, 2);
    await seedNotes(otherBlogPostId, 3);

    const response = await request(app.getHttpServer())
      .post(`/blog-posts/${ownBlogPostId}/notes/search`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(200);

    const body = response.body as {
      data: { id: string; body: string; rating: number }[];
      meta: { total: number };
    };
    expect(body.meta.total).toBe(2);
    expect(body.data.map((note) => note.body).sort()).toEqual([
      'note-0',
      'note-1',
    ]);
    expect(Object.keys(body.data[0]!).sort()).toEqual(
      ['id', 'body', 'rating', 'createdAt'].sort(),
    );
  });

  it("refuses a caller who cannot view the parent, without leaking the child's rows", async () => {
    const blogPostId = await createBlogPost(ownerToken);
    await seedNotes(blogPostId, 1);

    await request(app.getHttpServer())
      .post(`/blog-posts/${blogPostId}/notes/search`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({})
      .expect(403);
  });

  it('paginates the same way the referenced blueprint declared', async () => {
    const blogPostId = await createBlogPost(ownerToken);
    await seedNotes(blogPostId, 6);

    const defaultPage = await request(app.getHttpServer())
      .post(`/blog-posts/${blogPostId}/notes/search`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(200);

    const defaultBody = defaultPage.body as {
      data: unknown[];
      meta: { limit: number; total: number; last_page: number };
    };
    expect(defaultBody.meta.limit).toBe(5);
    expect(defaultBody.data).toHaveLength(5);
    expect(defaultBody.meta.total).toBe(6);
    expect(defaultBody.meta.last_page).toBe(2);

    await request(app.getHttpServer())
      .post(`/blog-posts/${blogPostId}/notes/search`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ limit: 999 })
      .expect(400);
  });
});
