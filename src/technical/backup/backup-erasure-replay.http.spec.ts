import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { env } from '#technical/config/env';
import { actingAs } from '#devtools/testing/acting-as';
import {
  createTestTenantId,
  purgeTenant,
} from '#devtools/testing/tenant-isolation';
import { waitFor } from '#devtools/testing/wait-for';
import { BackupService } from './backup.service';

function hasBackupTools(): boolean {
  if (process.env.CI) {
    return true;
  }

  try {
    execFileSync('pg_dump', ['--version']);
    return true;
  } catch {
    return false;
  }
}

// Needs pg_dump and pg_restore; under CI it always runs.
(hasBackupTools() ? describe : describe.skip)(
  'restoring a backup taken before an erasure',
  () => {
    let app: INestApplication<App>;
    let directory: string;
    const original = {
      BACKUP_DIR: env.BACKUP_DIR,
      PRIVACY_ERASURE_JOURNAL: env.PRIVACY_ERASURE_JOURNAL,
    };

    beforeAll(async () => {
      directory = await mkdtemp(path.join(os.tmpdir(), 'hery-erasure-'));
      Object.assign(env, {
        BACKUP_DIR: path.join(directory, 'backups'),
        PRIVACY_ERASURE_JOURNAL: path.join(directory, 'erasures.jsonl'),
      });

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      Object.assign(env, original);
      await rm(directory, { recursive: true, force: true });
    });

    it('erases the person again once the dump is back', async () => {
      const tenantId = createTestTenantId();
      const subject = await actingAs(app, { tenantId });
      const backups = app.get(BackupService, { strict: false });
      const backup = await backups.create();

      const response = await request(app.getHttpServer())
        .post('/privacy/erasures/user')
        .set('Authorization', subject.authorization)
        .send({ userId: subject.id })
        .expect(202);
      const requestId = (response.body as { data: { id: string } }).data.id;

      await waitFor(
        async () =>
          (
            await authPrismaClient.privacyRequest.findUniqueOrThrow({
              where: { id: requestId },
            })
          ).status === 'done',
        { timeoutMs: 20_000, description: 'the erasure to complete' },
      );

      const journal = await readFile(env.PRIVACY_ERASURE_JOURNAL, 'utf8');

      expect(journal).toContain(subject.id);
      expect(journal).not.toContain(subject.email);

      await backups.restore(backup.name);

      const restored = await authPrismaClient.user.findUniqueOrThrow({
        where: { id: subject.id },
      });

      expect(restored.email).not.toBe(subject.email);
      expect(restored.name).toBeNull();
      expect(restored.banned).toBe(true);

      await purgeTenant(tenantId);
    });
  },
);
