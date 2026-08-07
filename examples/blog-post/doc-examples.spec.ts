import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { env } from '#technical/config/env';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { PipelineStore } from '#devtools/pipeline/pipeline.store';
import type { TraceStep } from '#technical/tracing/trace-context';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import { BlogPostModule } from './blog-post.module';

interface PlaygroundScenario {
  id: string;
  label: string;
  method: string;
  path: string;
  request: string;
  response: string;
  flow: TraceStep[];
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CONTROLLER_SOURCE = readFileSync(
  resolve(__dirname, 'blog-post.controller.ts'),
  'utf8',
);

const OUTPUT_PATH = resolve(
  __dirname,
  '../../docs/src/data/endpoint-examples.generated.ts',
);

/**
 * Every fixture below is a real request against a real, running instance of
 * the framework -- not hand-typed JSON. The doc site cannot boot the app
 * itself (it is a static Astro build), so this suite is what regenerates
 * `endpoint-examples.generated.ts` each time it runs: change the example,
 * run the suite, the docs catch up.
 */
function extractHandler(marker: string): string {
  const start = CONTROLLER_SOURCE.indexOf(marker);
  if (start === -1) {
    throw new Error(`handler marker not found: ${marker}`);
  }

  const openBrace = CONTROLLER_SOURCE.indexOf('{', start);
  let depth = 0;
  let end = openBrace;

  for (let index = openBrace; index < CONTROLLER_SOURCE.length; index += 1) {
    if (CONTROLLER_SOURCE[index] === '{') depth += 1;
    if (CONTROLLER_SOURCE[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  return CONTROLLER_SOURCE.slice(start, end + 1).trimEnd();
}

function formatRequest(method: string, path: string, body?: unknown): string {
  const head = `${method} ${path}\nAuthorization: Bearer <token>`;

  if (body === undefined) {
    return head;
  }

  return `${head}\nContent-Type: application/json\n\n${JSON.stringify(body, null, 2)}`;
}

function formatResponse(body: unknown): string {
  return JSON.stringify(body, null, 2);
}

const resourceCode = {
  search: extractHandler("@Post('search')"),
  create: extractHandler("@Post('create')"),
  update: extractHandler("@Post('update')"),
  delete: extractHandler("@Post('delete')"),
  restore: extractHandler("@Post('restore')"),
  describe: extractHandler("@Get('describe')"),
};

const scenarios: {
  search: PlaygroundScenario[];
  create: PlaygroundScenario[];
  update: PlaygroundScenario[];
  delete: PlaygroundScenario[];
  restore: PlaygroundScenario[];
  details: PlaygroundScenario[];
} = {
  search: [],
  create: [],
  update: [],
  delete: [],
  restore: [],
  details: [],
};

describe('doc examples', () => {
  let app: INestApplication<App>;
  let owner: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    owner = await registerAndLogin(app);
    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
  });

  afterAll(async () => {
    writeGeneratedFile();
    await app.close();
    await prisma.$disconnect();
  });

  function latestFlow(): TraceStep[] {
    const store = app.get(PipelineStore, { strict: false });
    return store.list()[0]?.steps ?? [];
  }

  async function createOne(token: string, title: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: [{ title }] })
      .expect(201);

    return (response.body as { data: { data: { id: string } }[] }).data[0]!.data
      .id;
  }

  it('captures search: filtering by title', async () => {
    await createOne(owner.token, 'Hello world');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ filters: [{ field: 'title', operator: 'like', value: 'hello' }] })
      .expect(200);

    scenarios.search.push({
      id: 'filter',
      label: 'Filter on the title',
      method: 'POST',
      path: '/blog-posts/search',
      request: formatRequest('POST', '/blog-posts/search', {
        filters: [{ field: 'title', operator: 'like', value: 'hello' }],
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures search: sorting and paginating', async () => {
    await createOne(owner.token, 'Release notes');
    await createOne(owner.token, 'Changelog');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        sorts: [{ field: 'createdAt', direction: 'desc' }],
        page: 1,
        limit: 10,
      })
      .expect(200);

    scenarios.search.push({
      id: 'sort-paginate',
      label: 'Sort and paginate',
      method: 'POST',
      path: '/blog-posts/search',
      request: formatRequest('POST', '/blog-posts/search', {
        sorts: [{ field: 'createdAt', direction: 'desc' }],
        page: 1,
        limit: 10,
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures search: fetching by id', async () => {
    const id = await createOne(owner.token, 'Fetched by id');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ filters: [{ field: 'id', value: id }] })
      .expect(200);

    scenarios.search.push({
      id: 'by-id',
      label: 'Look one record up by id',
      method: 'POST',
      path: '/blog-posts/search',
      request: formatRequest('POST', '/blog-posts/search', {
        filters: [{ field: 'id', value: id }],
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures create: a valid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ data: [{ title: 'Hello world' }] })
      .expect(201);

    scenarios.create.push({
      id: 'create',
      label: 'Create a post',
      method: 'POST',
      path: '/blog-posts/create',
      request: formatRequest('POST', '/blog-posts/create', {
        data: [{ title: 'Hello world' }],
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures create: a rejected payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ data: [{}] })
      .expect(400);

    scenarios.create.push({
      id: 'validation-failed',
      label: 'Invalid payload',
      method: 'POST',
      path: '/blog-posts/create',
      request: formatRequest('POST', '/blog-posts/create', { data: [{}] }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures update: a plain field update', async () => {
    const id = await createOne(owner.token, 'Hello world');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ data: [{ id, title: 'Hello world (v2)' }] })
      .expect(201);

    scenarios.update.push({
      id: 'update',
      label: 'Update one field',
      method: 'POST',
      path: '/blog-posts/update',
      request: formatRequest('POST', '/blog-posts/update', {
        data: [{ id, title: 'Hello world (v2)' }],
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures update: attaching a tag', async () => {
    const id = await createOne(owner.token, 'Tagged article');
    const tag = await prisma.tag.create({
      data: {
        tenantId: 'default',
        name: 'release',
        createdAt: new Date().toISOString(),
      },
    });

    const response = await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ data: [{ id, relations: { tags: { attach: [tag.id] } } }] })
      .expect(201);

    scenarios.update.push({
      id: 'attach-tags',
      label: 'Attach a tag',
      method: 'POST',
      path: '/blog-posts/update',
      request: formatRequest('POST', '/blog-posts/update', {
        data: [{ id, relations: { tags: { attach: [tag.id] } } }],
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures delete: a soft delete', async () => {
    const id = await createOne(owner.token, 'Hello world');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ids: [id] })
      .expect(201);

    scenarios.delete.push({
      id: 'soft',
      label: 'Soft delete',
      method: 'POST',
      path: '/blog-posts/delete',
      request: formatRequest('POST', '/blog-posts/delete', { ids: [id] }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures delete: a hard delete', async () => {
    const id = await createOne(admin.token, 'Gone for good');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ids: [id], mode: 'hard' })
      .expect(201);

    scenarios.delete.push({
      id: 'hard',
      label: 'Hard delete',
      method: 'POST',
      path: '/blog-posts/delete',
      request: formatRequest('POST', '/blog-posts/delete', {
        ids: [id],
        mode: 'hard',
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures restore: undoing a soft delete', async () => {
    const id = await createOne(owner.token, 'Hello world');
    await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ids: [id] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/blog-posts/restore')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ids: [id] })
      .expect(201);

    scenarios.restore.push({
      id: 'restore',
      label: 'Restore',
      method: 'POST',
      path: '/blog-posts/restore',
      request: formatRequest('POST', '/blog-posts/restore', { ids: [id] }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures restore: restoring with a patch', async () => {
    const id = await createOne(owner.token, 'Hello world');
    await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ids: [id] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/blog-posts/restore')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ids: [id], patch: { title: 'Hello world (restored)' } })
      .expect(201);

    scenarios.restore.push({
      id: 'restore-with-patch',
      label: 'Restore with a fix',
      method: 'POST',
      path: '/blog-posts/restore',
      request: formatRequest('POST', '/blog-posts/restore', {
        ids: [id],
        patch: { title: 'Hello world (restored)' },
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures details: reading one record through search', async () => {
    const id = await createOne(owner.token, 'Hello world');

    const response = await request(app.getHttpServer())
      .post('/blog-posts/search')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ filters: [{ field: 'id', value: id }] })
      .expect(200);

    scenarios.details.push({
      id: 'read-one',
      label: 'Read one record',
      method: 'POST',
      path: '/blog-posts/search',
      request: formatRequest('POST', '/blog-posts/search', {
        filters: [{ field: 'id', value: id }],
      }),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });

  it('captures details: the resource contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/blog-posts/describe')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    scenarios.details.push({
      id: 'describe',
      label: 'The resource contract',
      method: 'GET',
      path: '/blog-posts/describe',
      request: formatRequest('GET', '/blog-posts/describe'),
      response: formatResponse(response.body),
      flow: latestFlow(),
    });
  });
});

function writeGeneratedFile(): void {
  const lines = [
    "import type { PlaygroundScenario } from './scenario-types';",
    '',
    `export const searchScenarios: PlaygroundScenario[] = ${JSON.stringify(scenarios.search, null, 2)};`,
    '',
    `export const createScenarios: PlaygroundScenario[] = ${JSON.stringify(scenarios.create, null, 2)};`,
    '',
    `export const updateScenarios: PlaygroundScenario[] = ${JSON.stringify(scenarios.update, null, 2)};`,
    '',
    `export const deleteScenarios: PlaygroundScenario[] = ${JSON.stringify(scenarios.delete, null, 2)};`,
    '',
    `export const restoreScenarios: PlaygroundScenario[] = ${JSON.stringify(scenarios.restore, null, 2)};`,
    '',
    `export const detailsScenarios: PlaygroundScenario[] = ${JSON.stringify(scenarios.details, null, 2)};`,
    '',
    `export const resourceCode = ${JSON.stringify(resourceCode, null, 2)};`,
    '',
  ];

  writeFileSync(OUTPUT_PATH, lines.join('\n'));
}
