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

describe('BlogPost pagination and caching', () => {
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

  async function createBlogPost(
    title: string,
    token = ownerToken,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: [{ title }] })
      .expect(201);

    const { data } = response.body as {
      data: { data: { id: string } }[];
    };
    return data[0]!.data.id;
  }

  async function search(body: Record<string, unknown>, token = ownerToken) {
    return request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
  }

  describe('cursor pagination', () => {
    it('has no gaps or duplicates when a row is inserted mid-pagination, unlike offset pagination', async () => {
      const { token } = await registerAndLogin(app);
      const ids: string[] = [];
      for (let i = 1; i <= 11; i++) {
        ids.push(await createBlogPost(`cursor-row-${i}`, token));
      }
      const oldest = ids[0]!;

      const offsetPage1 = await search({ page: 1, limit: 10 }, token);
      const offsetIdsPage1 = (
        offsetPage1.body as { data: { id: string }[] }
      ).data.map((record) => record.id);
      expect(offsetIdsPage1).toEqual([...ids].reverse().slice(0, 10));
      expect(offsetIdsPage1).not.toContain(oldest);

      const cursorPage1 = await search({ limit: 10 }, token);
      const cursorBody = cursorPage1.body as {
        data: { id: string }[];
        meta: { next_cursor: string | null };
      };
      expect(cursorBody.data.map((record) => record.id)).toEqual(
        offsetIdsPage1,
      );
      const cursor = cursorBody.meta.next_cursor;
      expect(cursor).not.toBeNull();
      const lastOfPage1 = offsetIdsPage1[offsetIdsPage1.length - 1]!;

      const inserted = await createBlogPost('cursor-inserted', token);

      const offsetPage2 = await search({ page: 2, limit: 10 }, token);
      const offsetIdsPage2 = (
        offsetPage2.body as { data: { id: string }[] }
      ).data.map((record) => record.id);
      expect(offsetIdsPage2).toContain(lastOfPage1);

      const cursorPage2 = await search({ limit: 10, cursor }, token);
      const cursorIdsPage2 = (
        cursorPage2.body as { data: { id: string }[] }
      ).data.map((record) => record.id);
      expect(cursorIdsPage2).toEqual([oldest]);
      expect(cursorIdsPage2).not.toContain(lastOfPage1);
      expect(cursorIdsPage2).not.toContain(inserted);
    });

    it('rejects a cursor combined with a page number', async () => {
      await createBlogPost('cursor-reject');
      const page1 = await search({ limit: 10 });
      const { next_cursor: cursor } = (
        page1.body as { meta: { next_cursor: string } }
      ).meta;

      await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ limit: 10, page: 1, cursor })
        .expect(400);
    });

    it('walks ties on the sort key without skipping or repeating a row', async () => {
      const created: string[] = [];
      for (let i = 1; i <= 12; i++) {
        created.push(await createBlogPost(`cursor-tie-${i}`));
      }
      await prisma.blogPost.updateMany({
        where: { id: { in: created } },
        data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      const seen: string[] = [];
      let cursor: string | null = null;
      const body = {
        limit: 10,
        sorts: [{ field: 'createdAt', direction: 'asc' }],
      };

      for (let guard = 0; guard < 50; guard++) {
        const response = await search(cursor ? { ...body, cursor } : body);
        const page = response.body as {
          data: { id: string }[];
          meta: { next_cursor: string | null };
        };
        seen.push(...page.data.map((record) => record.id));
        cursor = page.meta.next_cursor;
        if (!cursor) {
          break;
        }
      }

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expect.arrayContaining(created));
    });

    it('rejects a sort the blueprint does not declare', async () => {
      await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ limit: 10, sorts: [{ field: 'title', direction: 'asc' }] })
        .expect(400);
    });

    it('rejects a cursor replayed under a different sort', async () => {
      for (let i = 1; i <= 10; i++) {
        await createBlogPost(`cursor-sort-${i}`);
      }
      const first = await search({ limit: 10 });
      const cursor = (first.body as { meta: { next_cursor: string } }).meta
        .next_cursor;

      await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          limit: 10,
          cursor,
          sorts: [{ field: 'createdAt', direction: 'asc' }],
        })
        .expect(400);
    });

    it('rejects a tampered cursor', async () => {
      for (let i = 1; i <= 10; i++) {
        await createBlogPost(`cursor-tamper-${i}`);
      }
      const first = await search({ limit: 10 });
      const cursor = (first.body as { meta: { next_cursor: string } }).meta
        .next_cursor;
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as {
        sorts: { field: string }[];
      };
      decoded.sorts[0]!.field = 'tenantId';
      const tampered = Buffer.from(JSON.stringify(decoded)).toString(
        'base64url',
      );

      await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ limit: 10, cursor: tampered })
        .expect(400);
    });

    it('still continues when the row the cursor points at was deleted', async () => {
      for (let i = 1; i <= 12; i++) {
        await createBlogPost(`cursor-del-${i}`);
      }
      const first = await search({ limit: 10 });
      const firstBody = first.body as {
        data: { id: string }[];
        meta: { next_cursor: string };
      };
      const lastId = firstBody.data[firstBody.data.length - 1]!.id;

      await request(app.getHttpServer())
        .post('/blog-posts/delete')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ids: [lastId] })
        .expect(201);

      const second = await search({
        limit: 10,
        cursor: firstBody.meta.next_cursor,
      });
      const ids = (second.body as { data: { id: string }[] }).data.map(
        (record) => record.id,
      );
      expect(ids).not.toContain(lastId);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('rejects a malformed cursor', async () => {
      await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ limit: 10, cursor: 'not-a-real-cursor' })
        .expect(400);
    });
  });

  describe('ETag / If-None-Match', () => {
    it('returns the same ETag for the same unchanged data and 304s on a matching If-None-Match', async () => {
      await createBlogPost('etag-a');

      const first = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ limit: 10 })
        .expect(200);
      const etag = first.headers.etag as string;
      expect(etag).toBeTruthy();

      const second = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ limit: 10 })
        .expect(200);
      expect(second.headers.etag).toBe(etag);

      const notModified = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('If-None-Match', etag)
        .send({ limit: 10 })
        .expect(304);
      expect(notModified.body).toEqual({});

      await createBlogPost('etag-b');

      const changed = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('If-None-Match', etag)
        .send({ limit: 10 })
        .expect(200);
      expect(changed.headers.etag).not.toBe(etag);
    });

    it('gives the same describe payload a different ETag per caller', async () => {
      const ownerResponse = await request(app.getHttpServer())
        .get('/blog-posts/describe')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const strangerResponse = await request(app.getHttpServer())
        .get('/blog-posts/describe')
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(200);

      expect(ownerResponse.body).toEqual(strangerResponse.body);
      expect(ownerResponse.headers['cache-control']).toBe('private, no-cache');
      expect(ownerResponse.headers.vary).toContain('Authorization');
      expect(ownerResponse.headers.etag).toBeTruthy();
      expect(ownerResponse.headers.etag).not.toBe(
        strangerResponse.headers.etag,
      );
    });
  });
});
