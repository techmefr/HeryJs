import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';

const KEY_PREFIX = 'lock:';

export interface LockPolicy {
  ttlMs: number;
}

/**
 * Thirty seconds, renewed at a third of that while the holder is alive. Short
 * enough that a crashed holder frees the lock quickly; long enough that one
 * missed renewal (a GC pause, a slow tick) does not lose it.
 */
export const DEFAULT_LOCK_POLICY: LockPolicy = { ttlMs: 30_000 };

// Compare-and-delete: a lock is released only by the token that acquired it.
// Deleting by key alone would let a holder whose TTL already expired -- and
// whose key another instance has since acquired -- delete that other
// instance's lock on its way out, which is a lock two instances now believe
// neither of them holds.
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

// Compare-and-extend, same reasoning as release: only the current holder's
// heartbeat may push the TTL back out.
const RENEW_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  end
  return 0
`;

export class LockHandle {
  private heartbeat: NodeJS.Timeout | undefined;
  private released = false;

  constructor(
    private readonly client: IORedis,
    private readonly key: string,
    private readonly token: string,
    ttlMs: number,
  ) {
    // Renewed automatically for as long as the process holding it is alive, so
    // a task running longer than the TTL keeps its lock instead of a second
    // instance acquiring the same one underneath it. A crashed holder simply
    // stops renewing, and the TTL is what frees the lock in that case.
    this.heartbeat = setInterval(
      () => {
        void this.client.eval(RENEW_SCRIPT, 1, this.key, this.token, ttlMs);
      },
      Math.floor(ttlMs / 3),
    );
    this.heartbeat.unref();
  }

  async release(): Promise<void> {
    if (this.released) {
      return;
    }

    this.released = true;
    clearInterval(this.heartbeat);
    await this.client.eval(RELEASE_SCRIPT, 1, this.key, this.token);
  }

  /**
   * Stops renewing without deleting the key, so the lock expires on its own at
   * the next TTL rather than being freed immediately. For the shutdown path
   * that cannot guarantee it will finish a clean `release()` -- there is
   * nothing unsafe about the key outliving the process a little longer, and
   * the alternative is a heartbeat firing after nothing is left to hold it.
   */
  stopRenewing(): void {
    this.released = true;
    clearInterval(this.heartbeat);
  }
}

/**
 * "Only one of these may run at a time" is not only a scheduler problem, so
 * this is a primitive rather than something bolted onto ScheduledTaskStore --
 * application code needing the same guarantee reaches for the same lock,
 * not a second mechanism.
 *
 * Deliberately silent on what a caller does when acquire() returns null: a
 * cron skips a run it could not get exclusive access to, a job usually wants
 * to fail or retry instead. The primitive answering that for both is how a
 * scheduler-shaped default becomes the wrong default for a job.
 */
@Injectable()
export class LockService implements OnModuleDestroy {
  private readonly client = new IORedis(env.REDIS_URL);

  async acquire(
    name: string,
    policy: LockPolicy = DEFAULT_LOCK_POLICY,
  ): Promise<LockHandle | null> {
    const key = `${KEY_PREFIX}${name}`;
    const token = randomUUID();

    const acquired = await this.client.set(
      key,
      token,
      'PX',
      policy.ttlMs,
      'NX',
    );

    if (acquired !== 'OK') {
      return null;
    }

    return new LockHandle(this.client, key, token, policy.ttlMs);
  }

  /**
   * The convenience most callers want: run `fn` under the lock if it can be
   * acquired, skip otherwise. Named for the cron case the issue calls out --
   * a job that wants a different answer on contention calls `acquire`
   * directly and decides for itself.
   */
  async runExclusively(
    name: string,
    fn: () => Promise<void> | void,
    policy: LockPolicy = DEFAULT_LOCK_POLICY,
  ): Promise<'ran' | 'skipped'> {
    const lock = await this.acquire(name, policy);

    if (!lock) {
      return 'skipped';
    }

    try {
      await fn();
      return 'ran';
    } finally {
      await lock.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
