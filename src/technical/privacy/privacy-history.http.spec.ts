import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { HistoryEntryNotFoundException } from '#technical/errors/history-entry-not-found.exception';
import { HistoryService } from '#technical/history/history.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { actingAs } from '#devtools/testing/acting-as';
import type { Actor } from '#devtools/testing/acting-as';
import {
  createTestTenantId,
  purgeTenant,
} from '#devtools/testing/tenant-isolation';
import { SnippetModule } from '../../../examples/snippet/snippet.module';
import { PersonalDataRegistry } from './personal-data.registry';

interface Entry {
  id: string;
  snapshot: Record<string, unknown>;
}

describe('privacy erasure and row history', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SnippetModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    app.get(PersonalDataRegistry, { strict: false }).register({
      model: 'Snippet',
      erase: 'anonymise',
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
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAndEdit(actor: Actor, marker: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', actor.authorization)
      .send({ data: [{ title: marker }] })
      .expect(201);
    const id = (created.body as { data: { data: { id: string } }[] }).data[0]!
      .data.id;

    await request(app.getHttpServer())
      .post('/snippets/update')
      .set('Authorization', actor.authorization)
      .send({ data: [{ id, version: 1, title: `${marker}-edited` }] })
      .expect(201);

    return id;
  }

  async function entriesOf(actor: Actor, id: string): Promise<Entry[]> {
    const response = await request(app.getHttpServer())
      .post(`/snippets/${id}/history`)
      .set('Authorization', actor.authorization)
      .send({})
      .expect(200);

    return (response.body as { data: Entry[] }).data;
  }

  async function settled(actor: Actor, path: string, body: object) {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', actor.authorization)
      .send(body)
      .expect(202);
    const id = (response.body as { data: { id: string } }).data.id;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      const row = await authPrismaClient.privacyRequest.findUniqueOrThrow({
        where: { id },
      });

      if (row.status === 'done' || row.status === 'failed') {
        return row;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(`privacy request ${id} did not settle`);
  }

  it('drops the history of an erased user rows, so no revert can write them back', async () => {
    const tenantId = createTestTenantId();
    const subject = await actingAs(app, { tenantId });
    const marker = `erase-history-${randomUUID()}`;
    const id = await createAndEdit(subject, marker);
    const before = await entriesOf(subject, id);

    expect(before.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(before)).toContain(marker);

    expect(
      await settled(subject, '/privacy/erasures/user', { userId: subject.id }),
    ).toMatchObject({ status: 'done', error: null });

    const history = app.get(HistoryService, { strict: false });
    const inTenant = <T>(run: () => Promise<T>) =>
      TenantContextStorage.run({ tenantId }, run);

    expect(
      (await inTenant(() => history.list('Snippet', id, {}))).entries,
    ).toEqual([]);
    await expect(
      inTenant(() =>
        history.find('Snippet', id, before[before.length - 1]!.id),
      ),
    ).rejects.toThrow(HistoryEntryNotFoundException);
    expect(
      await authPrismaClient.recordSnapshot.count({
        where: { tenantId, recordId: id },
      }),
    ).toBe(0);

    const row = await authPrismaClient.snippet.findUniqueOrThrow({
      where: { id },
    });

    expect(row.title).not.toContain(marker);

    await purgeTenant(tenantId);
  });

  it('drops every snapshot of an erased tenant and none of another tenant', async () => {
    const tenantId = createTestTenantId();
    const admin = await actingAs(app, { tenantId, role: 'admin' });
    const member = await actingAs(app, { tenantId });
    const foreignTenantId = createTestTenantId();
    const foreign = await actingAs(app, { tenantId: foreignTenantId });

    await createAndEdit(member, `tenant-${randomUUID()}`);
    const foreignId = await createAndEdit(foreign, `foreign-${randomUUID()}`);

    expect(
      await settled(admin, '/privacy/erasures/tenant', { confirm: tenantId }),
    ).toMatchObject({ status: 'done', error: null });

    expect(
      await authPrismaClient.recordSnapshot.count({ where: { tenantId } }),
    ).toBe(0);
    expect(
      await authPrismaClient.recordSnapshot.count({
        where: { tenantId: foreignTenantId, recordId: foreignId },
      }),
    ).toBeGreaterThanOrEqual(2);

    await purgeTenant(tenantId);
    await purgeTenant(foreignTenantId);
  });
});
