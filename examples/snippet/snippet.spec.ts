import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { SnippetModule } from './snippet.module';
import { env } from '#technical/config/env';
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';
import { actingAs, registerAndLogin } from '#devtools/test-support';

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
        softDeletes: boolean;
        relations: string[];
        rules: { create: { required?: string[] } };
      };
    };
    expect(body.data.fields.map((field) => field.name)).toEqual([
      'title',
      'summary',
    ]);
    expect(body.data.paginated).toBe(true);
    expect(body.data.softDeletes).toBe(true);
    expect(body.data).toMatchObject({
      versioned: { field: 'version', header: 'If-Match' },
    });
    expect(body.data.relations).toEqual([]);
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
      .send({
        capabilities: [
          'update',
          'delete',
          'restore',
          'publish',
          'archive',
          'reopen',
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
      'archive',
      'delete',
      'publish',
      'reopen',
      'restore',
      'update',
    ]);
    expect(body.meta).toMatchObject({
      capabilities: { create: { allowed: true, scope: 'own' } },
      channels: ['snippet'],
    });
    expect(
      (body.meta as { capabilities: Record<string, unknown> }).capabilities,
    ).toHaveProperty('listTrashed');
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

  async function createOne(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);

    return (created.body as { data: { data: { id: string } }[] }).data[0]!.data
      .id;
  }

  async function readOne(id: string): Promise<Record<string, unknown>> {
    const found = await request(app.getHttpServer())
      .post('/snippets/search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filters: [{ field: 'id', value: id }] })
      .expect(200);

    return (found.body as { data: Record<string, unknown>[] }).data[0]!;
  }

  it('reports how many entries of a batch succeeded and failed', async () => {
    const recordId = await createOne();

    const response = await request(app.getHttpServer())
      .post('/snippets/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: [
          { id: recordId, version: 1, ...{ title: 'title-value' } },
          { id: 'missing-record', version: 1, ...{ title: 'title-value' } },
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
      .post('/snippets/create')
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
      .post('/snippets/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        atomic: true,
        data: [
          { id: recordId, version: 1, ...{ title: 'title-value' } },
          { id: 'missing-record', version: 1, ...{ title: 'title-value' } },
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

  it('undoes the entries already written when a later entry of an atomic batch fails', async () => {
    const first = await createOne();
    const second = await createOne();

    const response = await request(app.getHttpServer())
      .post('/snippets/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        atomic: true,
        data: [
          { id: first, version: 1, ...{ title: 'title-value' } },
          { id: second, version: 99, ...{ title: 'title-value' } },
        ],
      })
      .expect(422);

    const error = (
      response.body as {
        error: { key: string; details: { results: { status: string }[] } };
      }
    ).error;
    expect(error.key).toBe('batch.atomicFailed');
    expect(error.details.results.map((result) => result.status)).toEqual([
      'notApplied',
      'error',
    ]);
    expect((await readOne(first)).version).toBe(1);
    expect((await readOne(second)).version).toBe(1);
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
    const outsider = await actingAs(app, {
      tenantId: `tenant-${randomUUID()}`,
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
  describe('workflow', () => {
    it('starts in the initial state and publishes the machine in describe', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      expect(created.body).toMatchObject({
        data: [{ data: { status: 'draft' } }],
      });

      const described = await request(app.getHttpServer())
        .get('/snippets/describe')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(
        (
          described.body as {
            data: { workflow: { transitions: { name: string }[] } };
          }
        ).data.workflow.transitions.map((item) => item.name),
      ).toEqual(['publish', 'archive', 'reopen']);
      expect(recordId).toBeTruthy();
    });

    it('ignores a client that writes the state column directly', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      const response = await request(app.getHttpServer())
        .post('/snippets/update')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: recordId, version: 1, status: 'archived' }] })
        .expect(201);

      expect(
        (response.body as { data: { data: Record<string, unknown> }[] })
          .data[0]!.data.status,
      ).toBe('draft');
    });

    it('refuses a transition nobody declared', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      await request(app.getHttpServer())
        .post('/snippets/transition')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: recordId, transition: 'not-a-transition' }] })
        .expect(400);
    });

    it('moves along a declared edge and stores the new state', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value', summary: 'summary-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      const response = await request(app.getHttpServer())
        .post('/snippets/transition')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: recordId, transition: 'publish' }] })
        .expect(201);

      expect(
        (
          response.body as {
            data: {
              status: string;
              data?: Record<string, unknown>;
              error?: { status: number; key: string };
            }[];
          }
        ).data[0]!,
      ).toMatchObject({ status: 'ok', data: { status: 'published' } });
    });

    it('refuses the transition to someone the capability does not cover', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value', summary: 'summary-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      const response = await request(app.getHttpServer())
        .post('/snippets/transition')
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ data: [{ id: recordId, transition: 'publish' }] })
        .expect(201);

      expect(
        (
          response.body as {
            data: {
              status: string;
              data?: Record<string, unknown>;
              error?: { status: number; key: string };
            }[];
          }
        ).data[0]!,
      ).toMatchObject({ status: 'error', error: { status: 403 } });
    });

    it('refuses an illegal transition with a typed error', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value', summary: 'summary-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      await request(app.getHttpServer())
        .post('/snippets/transition')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: recordId, transition: 'publish' }] })
        .expect(201);
      const response = await request(app.getHttpServer())
        .post('/snippets/transition')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: recordId, transition: 'publish' }] })
        .expect(201);

      expect(
        (
          response.body as {
            data: {
              status: string;
              data?: Record<string, unknown>;
              error?: { status: number; key: string };
            }[];
          }
        ).data[0]!,
      ).toMatchObject({
        status: 'error',
        error: { status: 409, key: 'snippet.illegalTransition' },
      });
    });

    it('refuses a transition whose guard is not met', async () => {
      const created = await request(app.getHttpServer())
        .post('/snippets/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ title: 'title-value' }] })
        .expect(201);

      const recordId = (
        created.body as {
          data: { status: string; data: { id: string; status: string } }[];
        }
      ).data[0]!.data.id;

      const response = await request(app.getHttpServer())
        .post('/snippets/transition')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ data: [{ id: recordId, transition: 'publish' }] })
        .expect(201);

      expect(
        (
          response.body as {
            data: {
              status: string;
              data?: Record<string, unknown>;
              error?: { status: number; key: string };
            }[];
          }
        ).data[0]!,
      ).toMatchObject({
        status: 'error',
        error: { status: 422, key: 'snippet.transitionGuard' },
      });
    });
  });
});
