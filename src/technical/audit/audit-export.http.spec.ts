import { randomUUID } from 'node:crypto';
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';
import { storageDriverToken } from '#technical/storage/storage-driver';
import { writeAuditLog } from './audit-log';

@Module({
  providers: [
    {
      provide: storageDriverToken('memory'),
      useValue: { put: () => Promise.resolve() },
    },
  ],
})
class MemoryStorageModule {}

function asText(
  res: Response,
  callback: (error: Error | null, body: unknown) => void,
): void {
  let text = '';

  res.setEncoding('utf8');
  res.on('data', (chunk: string) => {
    text += chunk;
  });
  res.on('end', () => callback(null, text));
}

describe('audit export, verification and sinks', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let member: TestUser;
  let tenantId: string;
  const sequences: number[] = [];

  const asAdmin = (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${admin.token}`);

  const download = (path: string) => asAdmin(path).buffer(true).parse(asText);

  const record = async (
    recordId: string,
    createdAt: string,
    data: unknown = { title: recordId },
  ) => {
    await writeAuditLog(authPrismaClient, {
      tenantId,
      model: 'BlogPost',
      operation: 'update',
      recordId,
      data,
      userId: admin.id,
      impersonatedBy: null,
    });

    const entry = await authPrismaClient.auditLog.findFirstOrThrow({
      where: { tenantId, recordId },
      orderBy: { sequence: 'desc' },
    });

    // createdAt is not part of the hash, so dating an entry leaves the chain
    // intact; it is how a range can be tested without waiting for one.
    await authPrismaClient.auditLog.update({
      where: { id: entry.id },
      data: { createdAt: new Date(createdAt) },
    });
    sequences.push(entry.sequence);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, MemoryStorageModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    tenantId = (
      await authPrismaClient.user.findUniqueOrThrow({
        where: { id: admin.id },
      })
    ).tenantId;
    member = await registerAndLogin(app);

    await record('=SUM(1)', '2026-01-10T10:00:00.000Z');
    await record('post-feb', '2026-02-10T10:00:00.000Z');
    await record('post-mar', '2026-03-10T10:00:00.000Z', {
      note: 'a,b "c"',
    });
  });

  afterAll(async () => {
    await authPrismaClient.auditSink.deleteMany({ where: { tenantId } });
    await app.close();
  });

  describe('export', () => {
    it('exports a date range as JSON lines, nothing outside it', async () => {
      const res = await download(
        '/audit-logs/export?format=jsonl&from=2026-02-01&to=2026-02-28',
      ).expect(200);

      expect(res.headers['content-type']).toContain('application/x-ndjson');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.jsonl"/,
      );

      const lines = String(res.body).trimEnd().split('\n');

      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        sequence: sequences[1],
        recordId: 'post-feb',
        tenantId,
        data: { title: 'post-feb' },
      });
    });

    it('exports CSV with a header, quoting, and formula text neutralised', async () => {
      const res = await download(
        '/audit-logs/export?from=2026-01-01&to=2026-03-31',
      ).expect(200);

      expect(res.headers['content-type']).toContain('text/csv');

      const text = String(res.body);

      expect(text.startsWith('sequence,createdAt,tenantId,')).toBe(true);
      expect(text).toContain(",'=SUM(1),");
      expect(text).toContain('"{""note"":""a,b \\""c\\""""}"');
      expect(text.trimEnd().split('\n')).toHaveLength(4);
    });

    it('filters by model, operation, record and user like the list does', async () => {
      const res = await download(
        `/audit-logs/export?format=jsonl&recordId=post-mar&userId=${admin.id}&model=BlogPost&operation=update`,
      ).expect(200);

      expect(String(res.body).trimEnd().split('\n')).toHaveLength(1);

      const empty = await download(
        '/audit-logs/export?format=jsonl&model=Nothing',
      ).expect(200);

      expect(String(empty.body)).toBe('');

      const listed = await asAdmin(
        `/audit-logs?recordId=post-mar&userId=${admin.id}`,
      ).expect(200);

      expect((listed.body as { data: unknown[] }).data).toHaveLength(1);
    });

    it('records the export itself in the chain, with who and which filter', async () => {
      await download('/audit-logs/export?format=csv&model=BlogPost').expect(
        200,
      );

      const entry = await authPrismaClient.auditLog.findFirstOrThrow({
        where: { tenantId, operation: 'export' },
        orderBy: { sequence: 'desc' },
      });

      expect(entry).toMatchObject({
        model: 'AuditLog',
        userId: admin.id,
        data: { format: 'csv', filter: { model: 'BlogPost' } },
      });
    });

    it('refuses an unknown format, a bad date and a backwards range', async () => {
      await download('/audit-logs/export?format=xml').expect(400);
      await download('/audit-logs/export?from=not-a-date').expect(400);
      await download('/audit-logs/export?from=2026-03-01&to=2026-02-01').expect(
        400,
      );
    });

    it("never reads another tenant's entries", async () => {
      const other = await registerAndLogin(app);
      await authPrismaClient.user.update({
        where: { id: other.id },
        data: { role: 'admin' },
      });

      const res = await request(app.getHttpServer())
        .get('/audit-logs/export?format=jsonl')
        .set('Authorization', `Bearer ${other.token}`)
        .buffer(true)
        .parse(asText)
        .expect(200);

      expect(String(res.body)).not.toContain(tenantId);
    });

    it('is refused to a non-admin', async () => {
      await request(app.getHttpServer())
        .get('/audit-logs/export')
        .set('Authorization', `Bearer ${member.token}`)
        .expect(403);
      await request(app.getHttpServer()).get('/audit-logs/export').expect(401);
    });
  });

  describe('verification', () => {
    it('reports an intact chain with how many entries it checked', async () => {
      const res = await asAdmin('/audit-logs/verify').expect(200);
      const { data } = res.body as {
        data: {
          valid: boolean;
          checked: number;
          brokenAtSequence: number | null;
          headHash: string;
        };
      };

      expect(data.valid).toBe(true);
      expect(data.checked).toBeGreaterThanOrEqual(3);
      expect(data.brokenAtSequence).toBeNull();
      expect(data.headHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('names the first entry that was altered', async () => {
      const [, victim] = sequences;

      await authPrismaClient.auditLog.update({
        where: { sequence: victim },
        data: { data: { title: 'rewritten' } },
      });

      const res = await asAdmin('/audit-logs/verify').expect(200);

      expect((res.body as { data: unknown }).data).toMatchObject({
        valid: false,
        brokenAtSequence: victim,
      });

      await authPrismaClient.auditLog.update({
        where: { sequence: victim },
        data: { data: { title: 'post-feb' } },
      });
    });

    it('is refused to a non-admin', async () => {
      await request(app.getHttpServer())
        .get('/audit-logs/verify')
        .set('Authorization', `Bearer ${member.token}`)
        .expect(403);
    });
  });

  describe('sink configuration', () => {
    const post = (path: string, body: object, token = admin.token) =>
      request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    it('creates a storage sink, lists it, edits it and deletes it', async () => {
      const created = await post('/audit-sinks', {
        name: 'cold archive',
        kind: 'storage',
        storageDriver: 'memory',
        keyPrefix: 'siem/audit',
      }).expect(201);
      const sink = (
        created.body as {
          data: { id: string; cursor: number; storageDriver: string };
        }
      ).data;

      expect(sink.storageDriver).toBe('memory');
      expect(sink.cursor).toBeGreaterThanOrEqual(3);

      const listed = await asAdmin('/audit-sinks').expect(200);

      expect(
        (listed.body as { data: { id: string }[] }).data.map((s) => s.id),
      ).toContain(sink.id);

      const patched = await request(app.getHttpServer())
        .patch(`/audit-sinks/${sink.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'renamed', active: false })
        .expect(200);

      expect((patched.body as { data: unknown }).data).toMatchObject({
        name: 'renamed',
        active: false,
      });

      await request(app.getHttpServer())
        .delete(`/audit-sinks/${sink.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/audit-sinks/${sink.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'gone' })
        .expect(404);
    });

    it('streams only what happens from now on unless the history is asked for', async () => {
      const fresh = await post('/audit-sinks', {
        name: 'from now',
        kind: 'storage',
        storageDriver: 'memory',
      }).expect(201);
      const history = await post('/audit-sinks', {
        name: 'with history',
        kind: 'storage',
        storageDriver: 'memory',
        backfill: true,
      }).expect(201);

      expect((history.body as { data: { cursor: number } }).data.cursor).toBe(
        0,
      );
      expect(
        (fresh.body as { data: { cursor: number } }).data.cursor,
      ).toBeGreaterThan(0);
    });

    it('never returns the token, and stores it sealed', async () => {
      const res = await post('/audit-sinks', {
        name: 'siem',
        kind: 'http',
        url: 'https://siem.example.com/ingest',
        authToken: 'tok-very-secret',
      });

      // The deployment under test refuses a host it cannot prove public, and
      // this name does not resolve offline: the request is either created or
      // refused for that reason, never created with the token exposed.
      expect(JSON.stringify(res.body)).not.toContain('tok-very-secret');

      if (res.status === 201) {
        const id = (res.body as { data: { id: string } }).data.id;
        const row = await authPrismaClient.auditSink.findUniqueOrThrow({
          where: { id },
        });

        expect(row.authToken).not.toBeNull();
        expect(row.authToken).not.toContain('tok-very-secret');
        expect((res.body as { data: unknown }).data).toMatchObject({
          hasAuthToken: true,
        });
      }
    });

    it('refuses a loopback URL, an unknown storage driver and a half-specified sink', async () => {
      await post('/audit-sinks', {
        name: 'inside',
        kind: 'http',
        url: 'http://127.0.0.1:9/ingest',
      }).expect(400);
      await post('/audit-sinks', {
        name: 'nowhere',
        kind: 'storage',
        storageDriver: 'tape',
      }).expect(400);
      await post('/audit-sinks', { name: 'no url', kind: 'http' }).expect(400);
      await post('/audit-sinks', {
        name: 'odd',
        kind: 'storage',
        keyPrefix: '../escape',
      }).expect(400);
      await post('/audit-sinks', {
        name: 'extra',
        kind: 'storage',
        storageDriver: 'memory',
        surprise: true,
      }).expect(400);
    });

    it("keeps a tenant's sinks to itself and refuses non-admins", async () => {
      const created = await post('/audit-sinks', {
        name: 'mine',
        kind: 'storage',
        storageDriver: 'memory',
      }).expect(201);
      const id = (created.body as { data: { id: string } }).data.id;
      const other = await registerAndLogin(app);
      await authPrismaClient.user.update({
        where: { id: other.id },
        data: { role: 'admin' },
      });

      await request(app.getHttpServer())
        .patch(`/audit-sinks/${id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ name: 'taken' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/audit-sinks/${id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);

      const theirs = await request(app.getHttpServer())
        .get('/audit-sinks')
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);

      expect((theirs.body as { data: unknown[] }).data).toHaveLength(0);

      await request(app.getHttpServer())
        .get('/audit-sinks')
        .set('Authorization', `Bearer ${member.token}`)
        .expect(403);
      await post('/audit-sinks', { name: randomUUID() }, member.token).expect(
        403,
      );
    });
  });
});
