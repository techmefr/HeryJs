import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { actingAs } from '#devtools/testing/acting-as';
import type { Actor } from '#devtools/testing/acting-as';
import {
  createTestTenantId,
  purgeTenant,
} from '#devtools/testing/tenant-isolation';
import { SnippetModule } from '../../../examples/snippet/snippet.module';
import { waitFor } from '#devtools/testing/wait-for';
import { PersonalDataRegistry } from './personal-data.registry';

const COLLECTION = 'snippet';

class InMemoryIndex {
  private readonly documents = new Map<string, string>();

  index(id: string, tenantId: string): void {
    this.documents.set(`${COLLECTION}:${id}`, tenantId);
  }

  holds(id: string): boolean {
    return this.documents.has(`${COLLECTION}:${id}`);
  }

  remove(collection: string, id: string, tenantId: string): Promise<void> {
    if (this.documents.get(`${collection}:${id}`) === tenantId) {
      this.documents.delete(`${collection}:${id}`);
    }

    return Promise.resolve();
  }
}

describe('privacy erasure and external search indexes', () => {
  let app: INestApplication<App>;
  const engine = new InMemoryIndex();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SnippetModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const registry = app.get(PersonalDataRegistry, { strict: false });

    registry.register({
      model: 'Snippet',
      erase: 'delete',
      searchCollection: COLLECTION,
      fields: [
        {
          name: 'title',
          type: 'string',
          optional: false,
          translatable: false,
          personal: true,
        },
      ],
    });
    registry.registerSearchIndexRemover('memory', (collection, id, tenantId) =>
      engine.remove(collection, id, tenantId),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function indexedSnippet(actor: Actor): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', actor.authorization)
      .send({ data: [{ title: `indexed-${randomUUID()}` }] })
      .expect(201);
    const id = (created.body as { data: { data: { id: string } }[] }).data[0]!
      .data.id;

    engine.index(id, actor.tenantId);

    return id;
  }

  async function settled(actor: Actor, path: string, body: object) {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', actor.authorization)
      .send(body)
      .expect(202);
    const id = (response.body as { data: { id: string } }).data.id;

    return waitFor(
      async () => {
        const row = await authPrismaClient.privacyRequest.findUniqueOrThrow({
          where: { id },
        });

        return row.status === 'done' || row.status === 'failed' ? row : null;
      },
      {
        timeoutMs: 13_500,
        intervalMs: 150,
        description: `privacy request ${id} to settle`,
      },
    );
  }

  it('removes an erased user documents from every search index', async () => {
    const tenantId = createTestTenantId();
    const subject = await actingAs(app, { tenantId });
    const id = await indexedSnippet(subject);

    expect(engine.holds(id)).toBe(true);

    expect(
      await settled(subject, '/privacy/erasures/user', { userId: subject.id }),
    ).toMatchObject({ status: 'done', error: null });

    expect(engine.holds(id)).toBe(false);

    await purgeTenant(tenantId);
  });

  it('removes an erased tenant documents and leaves another tenant index alone', async () => {
    const tenantId = createTestTenantId();
    const admin = await actingAs(app, { tenantId, role: 'admin' });
    const member = await actingAs(app, { tenantId });
    const foreignTenantId = createTestTenantId();
    const foreign = await actingAs(app, { tenantId: foreignTenantId });

    const erasedId = await indexedSnippet(member);
    const foreignId = await indexedSnippet(foreign);

    expect(
      await settled(admin, '/privacy/erasures/tenant', { confirm: tenantId }),
    ).toMatchObject({ status: 'done', error: null });

    expect(engine.holds(erasedId)).toBe(false);
    expect(engine.holds(foreignId)).toBe(true);

    await purgeTenant(tenantId);
    await purgeTenant(foreignTenantId);
  });
});
