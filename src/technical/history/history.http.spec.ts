import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import { PruneService } from '#technical/prune/prune.service';
import { SnippetModule } from '../../../examples/snippet/snippet.module';

interface Entry {
  id: string;
  operation: string;
  snapshot: Record<string, unknown>;
}

describe('row history', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SnippetModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    token = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAndEdit(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: [{ title: 'first' }] })
      .expect(201);
    const id = (created.body as { data: { data: { id: string } }[] }).data[0]!
      .data.id;

    await request(app.getHttpServer())
      .post('/snippets/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: [{ id, version: 1, title: 'second' }] })
      .expect(201);

    return id;
  }

  async function entriesOf(id: string): Promise<Entry[]> {
    const response = await request(app.getHttpServer())
      .post(`/snippets/${id}/history`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    return (response.body as { data: Entry[] }).data;
  }

  it('records a soft delete and the restore that undoes it', async () => {
    const id = await createAndEdit();

    await request(app.getHttpServer())
      .post('/snippets/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [id] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/snippets/restore')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [id] })
      .expect(201);

    expect((await entriesOf(id)).map((entry) => entry.operation)).toEqual([
      'restore',
      'delete',
      'update',
      'create',
    ]);
  });

  it('keeps the newest snapshot of a record when prune ages the rest out', async () => {
    const id = await createAndEdit();
    const before = await entriesOf(id);

    await authPrismaClient.recordSnapshot.updateMany({
      where: { recordId: id },
      data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    const tenantId = (
      await authPrismaClient.recordSnapshot.findFirstOrThrow({
        where: { recordId: id },
      })
    ).tenantId;
    const result = await app
      .get(PruneService, { strict: false })
      .pruneModel(
        'RecordSnapshot',
        { retentionDays: 1, lock: false },
        { userId: null, impersonatedBy: null },
        tenantId,
      );

    expect(result.deletedCount).toBeGreaterThanOrEqual(1);
    expect((await entriesOf(id)).map((entry) => entry.id)).toEqual([
      before[0]!.id,
    ]);
  });
});
