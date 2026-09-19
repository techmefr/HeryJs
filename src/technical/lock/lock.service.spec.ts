import { LockService } from './lock.service';

function uniqueName(): string {
  return `spec:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

describe('LockService', () => {
  let locks: LockService;

  beforeAll(() => {
    locks = new LockService();
  });

  afterAll(async () => {
    await locks.onModuleDestroy();
  });

  it('acquires a lock nobody else holds', async () => {
    const lock = await locks.acquire(uniqueName());

    expect(lock).not.toBeNull();
    await lock?.release();
  });

  it('refuses a second acquire while the first is held', async () => {
    const name = uniqueName();
    const first = await locks.acquire(name);

    expect(await locks.acquire(name)).toBeNull();

    await first?.release();
  });

  it('lets a new acquire succeed once the holder releases', async () => {
    const name = uniqueName();
    const first = await locks.acquire(name);
    await first?.release();

    expect(await locks.acquire(name)).not.toBeNull();
  });

  /**
   * The bug this exists to prevent: a holder whose TTL has already expired
   * releasing what it still believes is its own lock, and in doing so deleting
   * the lock a second instance acquired in between. Compare-and-delete makes a
   * stale release a no-op instead of stealing someone else's lock.
   *
   * `stopRenewing` simulates the holder's process dying: the heartbeat that
   * would otherwise keep the lock alive forever stops, and the key is left to
   * expire on its own, the way a real crash would leave it.
   */
  it('does not release a lock acquired by someone else after its own expired', async () => {
    const name = uniqueName();
    const stale = await locks.acquire(name, { ttlMs: 50 });
    stale?.stopRenewing();

    await new Promise((resolve) => setTimeout(resolve, 80));
    const fresh = await locks.acquire(name);

    expect(fresh).not.toBeNull();

    await stale?.release();

    expect(await locks.acquire(name)).toBeNull();

    await fresh?.release();
  });

  /**
   * The other half of the same protection: the heartbeat renews the current
   * holder's own lock, and only its own -- renewing a lock someone else now
   * holds would extend a lease that is not the renewer's to extend.
   */
  it('keeps a long-running holder locked past its original TTL', async () => {
    const name = uniqueName();
    const lock = await locks.acquire(name, { ttlMs: 90 });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await locks.acquire(name)).toBeNull();

    await lock?.release();
    expect(await locks.acquire(name)).not.toBeNull();
  });

  describe('runExclusively', () => {
    it('runs the function and reports it ran', async () => {
      const seen: string[] = [];

      expect(
        await locks.runExclusively(uniqueName(), () => {
          seen.push('ran');
        }),
      ).toBe('ran');
      expect(seen).toEqual(['ran']);
    });

    it('releases the lock once the function finishes', async () => {
      const name = uniqueName();
      await locks.runExclusively(name, () => undefined);

      expect(await locks.runExclusively(name, () => undefined)).toBe('ran');
    });

    // A cron skips silently on contention -- the other instance is already
    // doing the work. A job wanting a different answer calls acquire directly.
    it('skips without running when the lock is already held', async () => {
      const name = uniqueName();
      const held = await locks.acquire(name);
      const seen: string[] = [];

      expect(
        await locks.runExclusively(name, () => {
          seen.push('ran');
        }),
      ).toBe('skipped');
      expect(seen).toEqual([]);

      await held?.release();
    });

    it('releases the lock even when the function throws', async () => {
      const name = uniqueName();

      await expect(
        locks.runExclusively(name, () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await locks.runExclusively(name, () => undefined)).toBe('ran');
    });
  });
});
