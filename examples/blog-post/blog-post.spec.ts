import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { BlogPostModule } from './blog-post.module';
import { env } from '#technical/config/env';
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';
import {
  resolveDefaultLocale,
  resolveSupportedLocales,
} from '#technical/i18n/locale.config';
import { actingAs, registerAndLogin } from '#devtools/test-support';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

describe('BlogPost resource', () => {
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

  it('creates records owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    expect(
      (
        response.body as {
          data: { status: string; data: { tenantId: string } }[];
        }
      ).data[0]!.data.tenantId,
    ).toBe('default');
  });

  it('stores privateNote sealed and never returns it', async () => {
    const secret = `privateNote-${randomUUID()}`;
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ ...{ title: 'title-value' }, privateNote: secret }] })
      .expect(201);

    expect(JSON.stringify(created.body)).not.toContain(secret);

    const listed = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(secret);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;
    const stored = await prisma.blogPost.findUniqueOrThrow({
      where: { id: recordId },
    });
    expect(stored.privateNote).toMatch(/^enc:/);
    expect(stored.privateNote).not.toContain(secret);
  });

  it('describes its fields and create/update rules for a frontend to consume', async () => {
    const response = await request(app.getHttpServer())
      .get('/blog-posts/describe')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as {
      data: {
        fields: Array<{ name: string }>;
        limits?: number[];
        paginated: boolean;
        softDeletes: boolean;
        relations: string[];
        rules: { create: { required?: string[] } };
      };
    };
    expect(body.data.fields.map((field) => field.name)).toEqual([
      'title',
      'slug',
      'summary',
      'privateNote',
    ]);
    expect(body.data.paginated).toBe(true);
    expect(body.data.softDeletes).toBe(true);
    expect(body.data.relations).toEqual(['tags']);
    expect(body.data.limits).toEqual([10, 15, 20]);
    expect(body.data.rules.create.required).toEqual(['title']);
  });

  it('keeps a record out of the results for anyone who cannot open it directly', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const detail = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((detail.body as { data: unknown[] }).data).toHaveLength(0);

    const list = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({})
      .expect(200);

    expect(
      (list.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(recordId);
  });

  it('keeps a trashed record out of the bin of anyone who cannot open it', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const bin = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ onlyTrashed: true })
      .expect(200);

    expect(
      (bin.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(recordId);
  });

  it('lists records with the capabilities named in the request body', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .send({
        capabilities: [
          'update',
          'delete',
          'restore',
          'attachTags',
          'detachTags',
        ],
      })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: Record<string, { allowed: boolean }> }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.capabilities.update?.allowed).toBe(true);
    expect(Object.keys(body.data[0]?.capabilities ?? {}).sort()).toEqual([
      'attachTags',
      'delete',
      'detachTags',
      'restore',
      'update',
    ]);
    expect(body.meta).toMatchObject({
      capabilities: { create: { allowed: true, scope: 'own' } },
      channels: ['blogPost'],
    });
    expect(
      (body.meta as { capabilities: Record<string, unknown> }).capabilities,
    ).toHaveProperty('listTrashed');
  });

  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const response = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ data: [{ id: recordId, ...{ title: 'title-value' } }] })
      .expect(201);

    const results = (
      response.body as {
        data: { id: string; status: string; error?: { status: number } }[];
      }
    ).data;
    expect(results[0]).toMatchObject({
      id: recordId,
      status: 'error',
      error: { status: 403 },
    });
  });

  async function createOne(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    return (created.body as { data: { data: { id: string } }[] }).data[0]!.data
      .id;
  }

  async function readOne(id: string): Promise<Record<string, unknown>> {
    const found = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: id }] })
      .expect(200);

    return (found.body as { data: Record<string, unknown>[] }).data[0]!;
  }

  it('reports how many entries of a batch succeeded and failed', async () => {
    const recordId = await createOne();

    const response = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: [
          { id: recordId, ...{ title: 'title-value' } },
          { id: 'missing-record', ...{ title: 'title-value' } },
        ],
      })
      .expect(201);

    const body = response.body as {
      data: { status: string; error?: { status: number } }[];
      meta: { total: number; succeeded: number; failed: number };
    };
    expect(body.meta).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(body.data.map((result) => result.status)).toEqual(['ok', 'error']);
    expect(body.data[1]!.error!.status).toBe(404);
  });

  it('creates every entry of an atomic batch together', async () => {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        atomic: true,
        data: [{ title: 'title-value' }, { title: 'title-value' }],
      })
      .expect(201);

    const body = response.body as {
      data: { status: string; data: { id: string } }[];
      meta: { total: number; succeeded: number; failed: number };
    };
    expect(body.meta).toEqual({ total: 2, succeeded: 2, failed: 0 });

    for (const result of body.data) {
      expect(result.status).toBe('ok');
      expect((await readOne(result.data.id)).id).toBe(result.data.id);
    }
  });

  it('writes nothing when an entry of an atomic batch cannot be applied', async () => {
    const recordId = await createOne();
    const before = await readOne(recordId);

    const response = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        atomic: true,
        data: [
          { id: recordId, ...{ title: 'title-value' } },
          { id: 'missing-record', ...{ title: 'title-value' } },
        ],
      })
      .expect(422);

    const error = (
      response.body as {
        error: {
          key: string;
          details: {
            results: { status: string }[];
            summary: { total: number; succeeded: number; failed: number };
          };
        };
      }
    ).error;
    expect(error.key).toBe('batch.atomicFailed');
    expect(error.details.results.map((result) => result.status)).toEqual([
      'notApplied',
      'error',
    ]);
    expect(error.details.summary).toEqual({
      total: 2,
      succeeded: 0,
      failed: 1,
    });
    expect(await readOne(recordId)).toEqual(before);
  });

  it('hides a soft-deleted record from every default read, and only from those', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const ids = async (body: Record<string, unknown>) => {
      const response = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body)
        .expect(200);

      return (response.body as { data: { id: string }[] }).data.map(
        (record) => record.id,
      );
    };

    expect(await ids({})).not.toContain(recordId);
    expect(
      await ids({
        filters: [{ field: 'id', value: recordId }],
        includes: [{ relation: 'notes' }],
      }),
    ).not.toContain(recordId);
    expect(
      await ids({
        filters: [{ field: 'id', value: recordId }],
        aggregates: [{ relation: 'notes', type: 'count' }],
      }),
    ).not.toContain(recordId);

    const counted = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((counted.body as { meta: { total: number } }).meta.total).toBe(0);

    await request(app.getHttpServer())
      .post(`/blog-posts/${recordId}/notes/search`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(404);

    expect(
      await ids({
        withTrashed: true,
        filters: [{ field: 'id', value: recordId }],
      }),
    ).toContain(recordId);
    expect(
      await ids({
        onlyTrashed: true,
        filters: [{ field: 'id', value: recordId }],
      }),
    ).toContain(recordId);

    await request(app.getHttpServer())
      .post('/blog-posts/restore')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    expect(
      await ids({ filters: [{ field: 'id', value: recordId }] }),
    ).toContain(recordId);
  });

  it('soft-deletes then restores a record', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const trashed = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((trashed.body as { data: unknown[] }).data).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/blog-posts/restore')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const restored = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect(
      (restored.body as { data: { id: string }[] }).data.map(
        (record) => record.id,
      ),
    ).toContain(recordId);
  });

  it('refuses to restore a record that is not trashed', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const response = await request(app.getHttpServer())
      .post('/blog-posts/restore')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const results = (
      response.body as {
        data: { id: string; status: string; error?: { status: number } }[];
      }
    ).data;
    expect(results[0]).toMatchObject({
      id: recordId,
      status: 'error',
      error: { status: 409 },
    });
  });

  it('never lets a different tenant see this tenant records', async () => {
    const outsider = await actingAs(app, {
      tenantId: `tenant-${randomUUID()}`,
    });

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({})
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });

  it('cannot be spoofed into another tenant via a client-supplied header', async () => {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', `tenant-${randomUUID()}`)
      .send({})
      .expect(200);

    expect(
      (response.body as { data: Array<{ tenantId: string }> }).data.every(
        (record) => record.tenantId === 'default',
      ),
    ).toBe(true);
  });

  it('reports pagination meta alongside the results', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(200);

    const { meta } = response.body as {
      meta: { page: number; limit: number; total: number; last_page: number };
    };
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(15);
    expect(meta.total).toBeGreaterThan(0);
    expect(meta.last_page).toBeGreaterThanOrEqual(1);
  });

  it('rejects a page size the blueprint did not declare', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ limit: 21 })
      .expect(400);
  });

  it('rejects an include naming a relation this resource does not declare', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ includes: [{ relation: 'doesNotExist' }] })
      .expect(400);
  });

  it('rejects an aggregate naming a relation this resource does not declare', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ aggregates: [{ relation: 'doesNotExist', type: 'count' }] })
      .expect(400);
  });

  it('rejects a batch larger than the framework allows in one call', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: Array.from({ length: MAX_BATCH_ENTRIES + 1 }, () => ({
          title: 'title-value',
        })),
      })
      .expect(400);
  });

  it('rejects a search carrying more filters than the framework allows', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        filters: Array.from({ length: 51 }, () => ({
          field: 'id',
          value: 'none',
        })),
      })
      .expect(400);
  });

  it('finds a record by text search through the explicitly named default engine', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const record = (
      created.body as {
        data: { status: string; data: Record<string, unknown> }[];
      }
    ).data[0]!.data;
    const term = String(record.title);

    const found = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .send({ search: { q: term, engine: 'prisma' } })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(
      (found.body as { data: { id: string }[] }).data.map((r) => r.id),
    ).toContain(record.id);

    // Every engine caps its results at some default of its own, so a search
    // says which cap applied and whether it was reached -- a total taken from
    // a truncated match set is a floor, and the caller has to be able to tell.
    expect((found.body as { meta: { search: unknown } }).meta.search).toEqual({
      matchLimit: env.SEARCH_MATCH_LIMIT,
      truncated: false,
    });
  });

  it('rejects a search engine keyword hery.config.ts never declared', async () => {
    await request(app.getHttpServer())
      .post('/blog-posts/search')
      .send({ search: { q: 'anything', engine: 'nonexistent' } })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('attaches, syncs, and detaches tags through the update route', async () => {
    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const childA = await prisma.tag.create({
      data: {
        tenantId: 'default',
        name: 'name-value',
        createdAt: new Date().toISOString(),
      },
    });
    const childB = await prisma.tag.create({
      data: {
        tenantId: 'default',
        name: 'name-value',
        createdAt: new Date().toISOString(),
      },
    });

    const attached = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: [{ id: recordId, relations: { tags: { attach: [childA.id] } } }],
      })
      .expect(201);

    expect(
      (attached.body as { data: { data: { tags: string[] } }[] }).data[0]!.data
        .tags,
    ).toEqual([childA.id]);

    const members = await request(app.getHttpServer())
      .post('/blog-posts/' + recordId + '/tags/members')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(
      (members.body as { data: { id: string }[] }).data.map((row) => row.id),
    ).toEqual([childA.id]);

    const options = await request(app.getHttpServer())
      .post('/blog-posts/' + recordId + '/tags/options')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(200);

    expect(
      (options.body as { data: { id: string }[] }).data.map((row) => row.id),
    ).toEqual(expect.arrayContaining([childA.id, childB.id]));

    const synced = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: [{ id: recordId, relations: { tags: { sync: [childB.id] } } }],
      })
      .expect(201);

    expect(
      (synced.body as { data: { data: { tags: string[] } }[] }).data[0]!.data
        .tags,
    ).toEqual([childB.id]);

    const detached = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: [{ id: recordId, relations: { tags: { detach: [childB.id] } } }],
      })
      .expect(201);

    expect(
      (detached.body as { data: { data: { tags: string[] } }[] }).data[0]!.data
        .tags,
    ).toEqual([]);
  });

  describe('translatable field summary', () => {
    const defaultLocale = resolveDefaultLocale();
    const otherLocale = resolveSupportedLocales().find(
      (locale) => locale !== defaultLocale,
    );
    const itWithAnotherLocale = otherLocale ? it : it.skip;

    async function createWith(
      value: unknown,
    ): Promise<Record<string, unknown>> {
      const response = await request(app.getHttpServer())
        .post('/blog-posts/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ ...{ title: 'title-value' }, summary: value }] })
        .expect(201);

      return (response.body as { data: { data: Record<string, unknown> }[] })
        .data[0]!.data;
    }

    async function searchAs(
      locale: string,
      body: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> {
      const response = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Accept-Language', locale)
        .send(body)
        .expect(200);

      return (response.body as { data: Record<string, unknown>[] }).data;
    }

    it('publishes which fields are translatable and the locales it serves', async () => {
      const response = await request(app.getHttpServer())
        .get('/blog-posts/describe')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const body = response.body as {
        data: {
          fields: Array<{ name: string; translatable?: boolean }>;
          locales: { supported: string[]; default: string };
        };
      };
      expect(
        body.data.fields.find((entry) => entry.name === 'summary')
          ?.translatable,
      ).toBe(true);
      expect(body.data.locales.default).toBe(defaultLocale);
      expect(body.data.locales.supported).toContain(defaultLocale);
    });

    it('writes a plain string to the locale of the request', async () => {
      const created = await createWith('plain-' + randomUUID());

      expect(created.summaryTranslations).toEqual({
        [defaultLocale]: created.summary,
      });
    });

    itWithAnotherLocale(
      'stores several locales at once and answers in the requested one',
      async () => {
        const marker = randomUUID();
        const created = await createWith({
          [defaultLocale]: 'default-' + marker,
          [otherLocale!]: 'other-' + marker,
        });

        expect(created.summary).toBe('default-' + marker);
        expect(created.summaryTranslations).toEqual({
          [defaultLocale]: 'default-' + marker,
          [otherLocale!]: 'other-' + marker,
        });

        const rows = await searchAs(otherLocale!, {
          filters: [{ field: 'id', value: created.id }],
        });
        expect(rows[0]!.summary).toBe('other-' + marker);
      },
    );

    itWithAnotherLocale(
      'falls back along the declared chain when a locale has no value',
      async () => {
        const marker = randomUUID();
        const created = await createWith({ [defaultLocale]: 'only-' + marker });

        const rows = await searchAs(otherLocale!, {
          filters: [{ field: 'id', value: created.id }],
        });
        expect(rows[0]!.summary).toBe('only-' + marker);
      },
    );

    itWithAnotherLocale(
      'merges the locales of an update into the stored ones and removes a null one',
      async () => {
        const marker = randomUUID();
        const created = await createWith({
          [defaultLocale]: 'first-' + marker,
        });

        await request(app.getHttpServer())
          .post('/blog-posts/update')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            data: [
              {
                id: created.id,
                summary: { [otherLocale!]: 'second-' + marker },
              },
            ],
          })
          .expect(201);

        const merged = await searchAs(defaultLocale, {
          filters: [{ field: 'id', value: created.id }],
        });
        expect(merged[0]!.summaryTranslations).toEqual({
          [defaultLocale]: 'first-' + marker,
          [otherLocale!]: 'second-' + marker,
        });

        await request(app.getHttpServer())
          .post('/blog-posts/update')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            data: [{ id: created.id, summary: { [otherLocale!]: null } }],
          })
          .expect(201);

        const removed = await searchAs(defaultLocale, {
          filters: [{ field: 'id', value: created.id }],
        });
        expect(removed[0]!.summaryTranslations).toEqual({
          [defaultLocale]: 'first-' + marker,
        });
      },
    );

    it('rejects a locale the project does not support', async () => {
      await request(app.getHttpServer())
        .post('/blog-posts/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          data: [{ ...{ title: 'title-value' }, summary: { xx: 'nope' } }],
        })
        .expect(400);
    });

    it('rejects a value that breaks the field rule in any locale', async () => {
      await request(app.getHttpServer())
        .post('/blog-posts/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          data: [
            { ...{ title: 'title-value' }, summary: { [defaultLocale]: '' } },
          ],
        })
        .expect(400);
    });

    itWithAnotherLocale(
      'finds a record by text in the resolved locale only',
      async () => {
        const marker = randomUUID();
        const created = await createWith({
          [defaultLocale]: 'alpha-' + marker,
          [otherLocale!]: 'beta-' + marker,
        });

        const hit = await searchAs(otherLocale!, {
          search: { q: 'beta-' + marker, engine: 'prisma' },
        });
        expect(hit.map((row) => row.id)).toContain(created.id);

        const miss = await searchAs(defaultLocale, {
          search: { q: 'beta-' + marker, engine: 'prisma' },
        });
        expect(miss.map((row) => row.id)).not.toContain(created.id);
      },
    );

    itWithAnotherLocale(
      'filters on the value resolved for the request locale',
      async () => {
        const marker = randomUUID();
        const created = await createWith({
          [defaultLocale]: 'left-' + marker,
          [otherLocale!]: 'right-' + marker,
        });
        const filters = [
          { field: 'summary', operator: '=', value: 'right-' + marker },
        ];

        const hit = await searchAs(otherLocale!, { filters });
        expect(hit.map((row) => row.id)).toEqual([created.id]);

        const miss = await searchAs(defaultLocale, { filters });
        expect(miss).toEqual([]);
      },
    );

    it('refuses an operator that has no meaning on translated text', async () => {
      await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filters: [{ field: 'summary', operator: '>', value: 'a' }] })
        .expect(400);
    });

    it('sorts on the value resolved for the request locale', async () => {
      const marker = randomUUID();
      await createWith({ [defaultLocale]: 'b-' + marker });
      await createWith({ [defaultLocale]: 'a-' + marker });
      await createWith({ [defaultLocale]: 'c-' + marker });

      const rows = await searchAs(defaultLocale, {
        filters: [{ field: 'summary', operator: 'like', value: marker }],
        sorts: [{ field: 'summary', direction: 'desc' }],
      });
      expect(rows.map((row) => row.summary)).toEqual([
        'c-' + marker,
        'b-' + marker,
        'a-' + marker,
      ]);
    });
  });

  describe('slug field slug', () => {
    type CreateOutcome = {
      status: string;
      data: Record<string, unknown>;
      error?: { status: number; key: string };
    };

    async function createWith(
      overrides: Record<string, unknown>,
    ): Promise<CreateOutcome> {
      const response = await request(app.getHttpServer())
        .post('/blog-posts/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ ...{ title: 'title-value' }, ...overrides }] })
        .expect(201);

      return (
        response.body as {
          data: {
            status: string;
            data: Record<string, unknown>;
            error?: { status: number; key: string };
          }[];
        }
      ).data[0]!;
    }

    it('publishes where the slug comes from and whether it stays put', async () => {
      const response = await request(app.getHttpServer())
        .get('/blog-posts/describe')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const body = response.body as {
        data: {
          fields: Array<{
            name: string;
            slug?: { source: string; stable: boolean };
          }>;
          rules: { create: { required?: string[] } };
        };
      };
      expect(
        body.data.fields.find((entry) => entry.name === 'slug')?.slug,
      ).toEqual({
        source: 'title',
        stable: false,
      });
      expect(body.data.rules.create.required ?? []).not.toContain('slug');
    });

    it('derives the slug from title, folded to lowercase ascii words', async () => {
      const marker = randomUUID();
      const { data } = await createWith({ title: 'Hello Wörld ' + marker });

      expect(data.slug).toBe('hello-world-' + marker);
    });

    it('numbers a slug another record of the tenant already holds', async () => {
      const marker = randomUUID();
      const first = await createWith({ title: 'Twin ' + marker });
      const second = await createWith({ title: 'Twin ' + marker });
      const third = await createWith({ title: 'Twin ' + marker });

      expect(first.data.slug).toBe('twin-' + marker);
      expect(second.data.slug).toBe('twin-' + marker + '-2');
      expect(third.data.slug).toBe('twin-' + marker + '-3');
    });

    it('stays unique when the same source is created concurrently', async () => {
      const marker = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          createWith({ title: 'Race ' + marker }),
        ),
      );

      const slugs = results.map((result) => result.data.slug);
      expect(results.every((result) => result.status === 'ok')).toBe(true);
      expect(new Set(slugs).size).toBe(4);
      expect(
        slugs.every((slug) => String(slug).startsWith('race-' + marker)),
      ).toBe(true);
    });

    it('keeps a slug the caller sends and refuses to hand the same one out twice', async () => {
      const marker = randomUUID();
      const chosen = 'chosen-' + marker;
      const first = await createWith({ slug: chosen });
      const second = await createWith({ slug: chosen });

      expect(first.data.slug).toBe(chosen);
      expect(second.status).toBe('error');
      expect(second.error).toMatchObject({ status: 409, key: 'slug.taken' });
    });

    it('refuses a slug that is not lowercase words joined by dashes', async () => {
      for (const bad of [
        'Not A Slug',
        'under_score',
        '-lead',
        'trail-',
        'a--b',
        '<script>',
      ]) {
        await request(app.getHttpServer())
          .post('/blog-posts/create')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ data: [{ ...{ title: 'title-value' }, slug: bad }] })
          .expect(400);
      }
    });

    it('finds a record by its slug', async () => {
      const marker = randomUUID();
      const created = await createWith({ title: 'Lookup ' + marker });
      await createWith({ title: 'Lookup other ' + marker });

      const response = await request(app.getHttpServer())
        .post('/blog-posts/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filters: [{ field: 'slug', value: 'lookup-' + marker }] })
        .expect(200);

      const rows = (response.body as { data: { id: string }[] }).data;
      expect(rows.map((row) => row.id)).toEqual([created.data.id]);
    });

    it('follows title when it changes', async () => {
      const marker = randomUUID();
      const { data: created } = await createWith({ title: 'Before ' + marker });

      const response = await request(app.getHttpServer())
        .post('/blog-posts/update')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: created.id, title: 'After ' + marker }] })
        .expect(201);

      const updated = (
        response.body as { data: { data: Record<string, unknown> }[] }
      ).data[0]!.data;
      expect(updated.slug).toBe('after-' + marker);
    });

    it('moves to a slug the caller sends on update, even when it is stable', async () => {
      const marker = randomUUID();
      const { data: created } = await createWith({ title: 'Moving ' + marker });

      const response = await request(app.getHttpServer())
        .post('/blog-posts/update')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: created.id, slug: 'moved-' + marker }] })
        .expect(201);

      const updated = (
        response.body as { data: { data: Record<string, unknown> }[] }
      ).data[0]!.data;
      expect(updated.slug).toBe('moved-' + marker);
    });
  });
});
