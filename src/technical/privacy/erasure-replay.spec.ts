import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeStorageDriver } from '#devtools/testing/fake-storage.driver';
import { env } from '#technical/config/env';
import type { DriverResolver } from '#technical/drivers/driver-resolver';
import { ErasureReplay } from './erasure-replay';
import type { PrivacyExecutor } from './privacy.executor';

describe('ErasureReplay', () => {
  const original = {
    PRIVACY_ERASURE_JOURNAL: env.PRIVACY_ERASURE_JOURNAL,
    PRIVACY_ERASURE_STORAGE_DRIVER: env.PRIVACY_ERASURE_STORAGE_DRIVER,
  };
  let directory: string;
  let storage: FakeStorageDriver;
  let executor: { eraseUser: jest.Mock; eraseTenant: jest.Mock };

  const resolverOf = (driver: FakeStorageDriver | undefined): DriverResolver =>
    ({ find: () => driver }) as unknown as DriverResolver;

  const replayOn = (driver: FakeStorageDriver | undefined): ErasureReplay =>
    new ErasureReplay(
      executor as unknown as PrivacyExecutor,
      resolverOf(driver),
    );

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'hery-journal-'));
    storage = new FakeStorageDriver();
    executor = {
      eraseUser: jest.fn().mockResolvedValue(undefined),
      eraseTenant: jest.fn().mockResolvedValue(undefined),
    };
    Object.assign(env, {
      PRIVACY_ERASURE_JOURNAL: path.join(directory, 'erasures.jsonl'),
      PRIVACY_ERASURE_STORAGE_DRIVER: undefined,
    });
  });

  afterEach(async () => {
    Object.assign(env, original);
    await rm(directory, { recursive: true, force: true });
  });

  describe('with PRIVACY_ERASURE_STORAGE_DRIVER set', () => {
    beforeEach(() => {
      env.PRIVACY_ERASURE_STORAGE_DRIVER = 's3';
    });

    it('journals to the storage driver, not to a local file', async () => {
      await replayOn(storage).record('erase-user', 'tenant-a', 'user-1', null);

      expect(storage.keys).toHaveLength(1);
      expect(storage.keys[0]).toMatch(/^privacy\/erasures\//);
      await expect(
        readFile(env.PRIVACY_ERASURE_JOURNAL, 'utf8'),
      ).rejects.toThrow(/ENOENT/);
    });

    it('stores identifiers only', async () => {
      await replayOn(storage).record(
        'erase-tenant',
        'tenant-a',
        'user-1',
        'user-2',
      );
      const stored = JSON.parse(
        (await storage.get(storage.keys[0]!)).toString('utf8'),
      ) as Record<string, unknown>;

      expect(Object.keys(stored).sort()).toEqual([
        'erasedAt',
        'keptUserId',
        'kind',
        'subjectId',
        'tenantId',
      ]);
    });

    it('replays on one instance what another instance journaled', async () => {
      await replayOn(storage).record('erase-user', 'tenant-a', 'user-1', null);
      await replayOn(storage).record(
        'erase-tenant',
        'tenant-b',
        'user-2',
        'user-3',
      );

      const outcome = await replayOn(storage).replay();

      expect(outcome).toEqual({ replayed: 2, skipped: 0 });
      expect(executor.eraseUser).toHaveBeenCalledWith('tenant-a', 'user-1');
      expect(executor.eraseTenant).toHaveBeenCalledWith('tenant-b', 'user-3');
    });

    it('refuses a driver that is not installed instead of journaling nowhere', async () => {
      await expect(
        replayOn(undefined).record('erase-user', 'tenant-a', 'user-1', null),
      ).rejects.toThrow(/PRIVACY_ERASURE_STORAGE_DRIVER/);
    });
  });

  it('falls back to the local file when no storage driver is named', async () => {
    await replayOn(storage).record('erase-user', 'tenant-a', 'user-1', null);

    expect(storage.keys).toEqual([]);
    expect(await readFile(env.PRIVACY_ERASURE_JOURNAL, 'utf8')).toContain(
      'user-1',
    );
    expect(await replayOn(storage).replay()).toEqual({
      replayed: 1,
      skipped: 0,
    });
  });
});
