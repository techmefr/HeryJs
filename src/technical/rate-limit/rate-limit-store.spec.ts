import type IORedis from 'ioredis';
import { waitFor } from '#devtools/testing/wait-for';
import { RateLimitStore } from './rate-limit-store';

describe('RateLimitStore', () => {
  let store: RateLimitStore;

  beforeAll(() => {
    store = new RateLimitStore();
  });

  afterAll(async () => {
    await store.onModuleDestroy();
  });

  function uniqueKey(): string {
    return `spec:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  it('allows requests under the limit and counts them down', async () => {
    const key = uniqueKey();

    const first = await store.hit(key, 3, 60);
    const second = await store.hit(key, 3, 60);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(first.retryAfterSeconds).toEqual(expect.any(Number));
    expect(second.remaining).toBe(1);
  });

  it('blocks once the limit is reached, without going negative', async () => {
    const key = uniqueKey();

    await store.hit(key, 1, 60);
    const blocked = await store.hit(key, 1, 60);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('keeps two keys from ever sharing a counter', async () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();

    await store.hit(keyA, 1, 60);
    const hitOnB = await store.hit(keyB, 1, 60);

    expect(hitOnB.allowed).toBe(true);
  });

  it('never leaves a counter without its window when a command fails midway', async () => {
    const key = uniqueKey();
    const { client } = store as unknown as { client: IORedis };
    const expire = jest
      .spyOn(client, 'expire')
      .mockRejectedValueOnce(new Error('connection lost'));

    try {
      await store.hit(key, 1, 60).catch(() => undefined);

      expect(await client.ttl(`rate-limit:${key}`)).toBeGreaterThan(0);
    } finally {
      expire.mockRestore();
    }
  });

  it('resets the counter once the window has elapsed', async () => {
    const key = uniqueKey();

    await store.hit(key, 1, 1);
    const blocked = await store.hit(key, 1, 1);
    expect(blocked.allowed).toBe(false);

    const afterReset = await waitFor(
      async () => {
        const hit = await store.hit(key, 1, 1);

        return hit.allowed ? hit : null;
      },
      { intervalMs: 100, description: 'the one-second window to elapse' },
    );
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });
});
