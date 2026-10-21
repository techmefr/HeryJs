import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { SnippetModule } from './snippet.module';
import { env } from '#technical/config/env';
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';
import { registerAndLogin } from '#devtools/testing/register-and-login';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

describe('Snippet resource', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SnippetModule],
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
      .post('/snippets/create')
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

  it('describes its fields and create/update rules for a frontend to consume', async () => {
    const response = await request(app.getHttpServer())
      .get('/snippets/describe')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as {
      data: {
        fields: Array<{ name: string }>;
        limits?: number[];
        paginated: boolean;
        rules: { create: { required?: string[] } };
      };
    };
    expect(body.data.fields.map((field) => field.name)).toEqual(['title']);
    expect(body.data.paginated).toBe(true);
    expect(body.data).toMatchObject({
      versioned: { field: 'version', header: 'If-Match' },
    });
    expect(body.data.limits).toEqual([10, 20]);
    expect(body.data.rules.create.required).toEqual(['title']);
  });

  it('keeps a record out of the results for anyone who cannot open it directly', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const detail = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((detail.body as { data: unknown[] }).data).toHaveLength(0);

    const list = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({})
      .expect(200);

    expect(
      (list.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(recordId);
  });

  it('keeps a trashed record out of the bin of anyone who cannot open it', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/snippets/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const bin = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ onlyTrashed: true })
      .expect(200);

    expect(
      (bin.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(recordId);
  });

  it('lists records with the capabilities named in the request body', async () => {
    await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/snippets/search')
      .send({ capabilities: ['update'] })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: { update: { allowed: boolean } } }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.capabilities.update.allowed).toBe(true);
    expect(body.meta).toMatchObject({
      capabilities: { create: { allowed: true, scope: 'own' } },
      channels: ['snippet'],
    });
  });

  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const response = await request(app.getHttpServer())
      .post('/snippets/update')
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

  it('rejects a stale write, accepts a current one, and bumps the version each time', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const createdRecord = (
      created.body as {
        data: { status: string; data: { id: string; version: number } }[];
      }
    ).data[0]!.data;
    expect(createdRecord.version).toBe(1);

    type Outcome = {
      status: string;
      data?: { version: number };
      error?: {
        status: number;
        key: string;
        details: { expected: number; current: number | null };
      };
    };
    const update = async (
      entry: Record<string, unknown>,
      ifMatch?: string,
    ): Promise<Outcome> => {
      const call = request(app.getHttpServer())
        .post('/snippets/update')
        .set('Authorization', `Bearer ${ownerToken}`);
      const response = await (ifMatch ? call.set('If-Match', ifMatch) : call)
        .send({
          data: [
            { id: createdRecord.id, ...{ title: 'title-value' }, ...entry },
          ],
        })
        .expect(201);

      return (response.body as { data: Outcome[] }).data[0]!;
    };

    const first = await update({ version: 1 });
    expect(first).toMatchObject({ status: 'ok', data: { version: 2 } });

    const stale = await update({ version: 1 });
    expect(stale).toMatchObject({
      status: 'error',
      error: {
        status: 409,
        key: 'record.versionConflict',
        details: { expected: 1, current: 2 },
      },
    });

    const viaHeader = await update({}, '"2"');
    expect(viaHeader).toMatchObject({ status: 'ok', data: { version: 3 } });

    const staleHeader = await update({}, 'W/"2"');
    expect(staleHeader).toMatchObject({
      status: 'error',
      error: {
        status: 412,
        key: 'record.preconditionFailed',
        details: { expected: 2, current: 3 },
      },
    });

    const missing = await update({});
    expect(missing).toMatchObject({
      status: 'error',
      error: { status: 428, key: 'record.versionRequired' },
    });
  });

  it('lets exactly one of two concurrent writes at the same version through', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/snippets/update')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            data: [{ id: recordId, version: 1, ...{ title: 'title-value' } }],
          }),
      ),
    );

    const statuses = responses.map(
      (response) =>
        (response.body as { data: { status: string }[] }).data[0]!.status,
    );
    expect(statuses.filter((status) => status === 'ok')).toHaveLength(1);
    expect(statuses.filter((status) => status === 'error')).toHaveLength(1);
  });

  it('refuses an If-Match header on a request that carries several entries', async () => {
    await request(app.getHttpServer())
      .post('/snippets/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('If-Match', '"1"')
      .send({
        data: [
          { id: 'a', ...{ title: 'title-value' } },
          { id: 'b', ...{ title: 'title-value' } },
        ],
      })
      .expect(400);
  });

  it('refuses a malformed If-Match header', async () => {
    await request(app.getHttpServer())
      .post('/snippets/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('If-Match', '*')
      .send({ data: [{ id: 'a', ...{ title: 'title-value' } }] })
      .expect(400);
  });

  it('hides a soft-deleted record from every default read, and only from those', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/snippets/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const ids = async (body: Record<string, unknown>) => {
      const response = await request(app.getHttpServer())
        .post('/snippets/search')
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
      }),
    ).not.toContain(recordId);
    expect(
      await ids({
        filters: [{ field: 'id', value: recordId }],
      }),
    ).not.toContain(recordId);

    const counted = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((counted.body as { meta: { total: number } }).meta.total).toBe(0);

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
      .post('/snippets/restore')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    expect(
      await ids({ filters: [{ field: 'id', value: recordId }] }),
    ).toContain(recordId);
  });

  it('soft-deletes then restores a record', async () => {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/snippets/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const trashed = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((trashed.body as { data: unknown[] }).data).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/snippets/restore')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [recordId] })
      .expect(201);

    const restored = await request(app.getHttpServer())
      .post('/snippets/search')
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
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const response = await request(app.getHttpServer())
      .post('/snippets/restore')
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
    const outsider = await registerAndLogin(app);
    await prisma.user.update({
      where: { email: outsider.email },
      data: { tenantId: `tenant-${randomUUID()}` },
    });

    const response = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({})
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });

  it('cannot be spoofed into another tenant via a client-supplied header', async () => {
    const response = await request(app.getHttpServer())
      .post('/snippets/search')
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
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(200);

    const { meta } = response.body as {
      meta: { page: number; limit: number; total: number; last_page: number };
    };
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(10);
    expect(meta.total).toBeGreaterThan(0);
    expect(meta.last_page).toBeGreaterThanOrEqual(1);
  });

  it('rejects a page size the blueprint did not declare', async () => {
    await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ limit: 21 })
      .expect(400);
  });

  it('rejects an include naming a relation this resource does not declare', async () => {
    await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ includes: [{ relation: 'doesNotExist' }] })
      .expect(400);
  });

  it('rejects an aggregate naming a relation this resource does not declare', async () => {
    await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ aggregates: [{ relation: 'doesNotExist', type: 'count' }] })
      .expect(400);
  });

  it('rejects a batch larger than the framework allows in one call', async () => {
    await request(app.getHttpServer())
      .post('/snippets/create')
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
      .post('/snippets/search')
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
      .post('/snippets/create')
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
      .post('/snippets/search')
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
      .post('/snippets/search')
      .send({ search: { q: 'anything', engine: 'nonexistent' } })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });
});
