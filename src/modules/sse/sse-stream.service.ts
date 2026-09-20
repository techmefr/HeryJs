import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';

const KEY_PREFIX = 'sse:';

/** Newest 500 messages, whichever channel: a browser reconnecting after a
 * longer gap than that gets told its backlog rolled off (see `SseController`)
 * rather than replayed a set an implementor half-remembers is complete. */
const DEFAULT_MAX_ENTRIES = 500;

/** Refreshed on every publish, so an idle channel's backlog still expires,
 * but a busy one is never cut short by the clock alone. */
const DEFAULT_TTL_SECONDS = 60 * 60;

export interface SseEntry {
  /** The Redis Stream id: `<unix-ms>-<seq>`, monotonic within a channel and
   * exactly what a browser echoes back as `Last-Event-ID` on reconnect. */
  id: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface SseSubscription {
  stop(): Promise<void>;
}

function streamKey(tenantId: string, channel: string): string {
  return `${KEY_PREFIX}${tenantId}:${channel}`;
}

function toEntry(id: string, fields: string[]): SseEntry {
  const record: Record<string, string> = {};

  for (let index = 0; index < fields.length; index += 2) {
    record[fields[index] as string] = fields[index + 1] as string;
  }

  return {
    id,
    event: record.event ?? 'message',
    payload: JSON.parse(record.data ?? '{}') as Record<string, unknown>,
  };
}

/**
 * The bus-to-browser bridge: a bounded, replayable backlog per
 * `tenant:channel`, backed by a Redis Stream rather than pub/sub. Pub/sub (as
 * `signal` uses) delivers only to a socket already listening -- there is
 * nothing to ask for what was missed. A stream's entries are addressable by
 * the same monotonic id `Last-Event-ID` is built around, so replaying after a
 * drop and continuing the live tail are the same read, from the same id
 * space, with no seam between them for a gap to hide in.
 */
@Injectable()
export class SseStreamService implements OnModuleDestroy {
  private readonly publisher = new IORedis(env.REDIS_URL);
  private readonly subscribers = new Set<IORedis>();

  /**
   * The one publish path onto this transport. A listener on the events bus
   * calls this from `handle()`; nothing else writes a stream entry, so there
   * is exactly one place that decides what a channel carries.
   *
   * `maxEntries`/`ttlSeconds` are method parameters rather than constructor
   * config so a spec can shrink the backlog to something it can fill in a
   * handful of calls, without Nest ever needing to resolve a primitive
   * dependency for the whole app.
   */
  async publish(
    tenantId: string,
    channel: string,
    event: string,
    payload: Record<string, unknown>,
    maxEntries: number = DEFAULT_MAX_ENTRIES,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    const key = streamKey(tenantId, channel);

    // Exact trim (no `~`), deliberately: approximate trimming can leave more
    // than `maxEntries` behind for a while, which would make `canReplay`
    // answer "yes" for an id that already should have rolled off -- handing
    // the client back a false sense of continuity instead of the honest
    // stale-connection signal.
    const id = await this.publisher.xadd(
      key,
      'MAXLEN',
      maxEntries,
      '*',
      'event',
      event,
      'data',
      JSON.stringify(payload),
    );

    await this.publisher.expire(key, ttlSeconds);

    return id as string;
  }

  /**
   * Whether `lastEventId` is still answerable from this channel's backlog.
   * `false` means the gap between it and now is one the backlog no longer
   * covers -- the caller has to tell the client rather than silently skip
   * the entries it cannot see any more.
   */
  async canReplay(
    tenantId: string,
    channel: string,
    lastEventId: string,
  ): Promise<boolean> {
    const key = streamKey(tenantId, channel);
    const oldest = await this.publisher.xrange(key, '-', '+', 'COUNT', 1);

    if (oldest.length === 0) {
      return true;
    }

    const [oldestId] = oldest[0] as [string, string[]];

    return compareStreamIds(oldestId, lastEventId) <= 0;
  }

  /** Every entry strictly after `lastEventId`, oldest first. */
  async replaySince(
    tenantId: string,
    channel: string,
    lastEventId: string,
  ): Promise<SseEntry[]> {
    const key = streamKey(tenantId, channel);
    const entries = await this.publisher.xrange(key, `(${lastEventId}`, '+');

    return entries.map(([id, fields]) => toEntry(id, fields));
  }

  /**
   * Blocks for new entries after `afterId` and hands each to `onEntry` as it
   * arrives, on a dedicated connection -- `XREAD BLOCK` occupies the
   * connection it runs on, so a per-subscriber client is what lets every
   * other tenant's stream keep working while this one waits.
   */
  subscribeLive(
    tenantId: string,
    channel: string,
    afterId: string,
    onEntry: (entry: SseEntry) => void,
  ): SseSubscription {
    const client = new IORedis(env.REDIS_URL);
    this.subscribers.add(client);

    const key = streamKey(tenantId, channel);
    let cursor = afterId;
    let stopped = false;

    const loop = async (): Promise<void> => {
      while (!stopped) {
        let result: [string, [string, string[]][]][] | null;

        try {
          result = await client.xread('BLOCK', 25000, 'STREAMS', key, cursor);
        } catch {
          // The connection was quit from stop() mid-block; xread rejects and
          // the loop exits rather than retrying against a dead client.
          return;
        }

        if (!result) {
          continue;
        }

        const [, entries] = result[0] as [string, [string, string[]][]];

        for (const [id, fields] of entries) {
          cursor = id;
          onEntry(toEntry(id, fields));
        }
      }
    };

    void loop();

    return {
      stop: () => {
        stopped = true;
        this.subscribers.delete(client);
        // disconnect(), not quit(): the connection is parked inside a
        // blocking XREAD, and quit() waits for that reply before closing --
        // which arrives only when the next message does, or never. Dropping
        // the connection outright is what makes the blocked call reject
        // immediately, which the read loop above already treats as its exit
        // signal.
        client.disconnect();
        return Promise.resolve();
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.subscribers.forEach((client) => client.disconnect());
    await this.publisher.quit();
  }
}

/** Redis Stream ids sort as `<ms>-<seq>` pairs of integers, not as strings
 * ("10-0" < "9-0" lexically but not numerically) -- so comparing them for
 * `canReplay` has to parse both parts rather than use `<`. */
function compareStreamIds(a: string, b: string): number {
  const [msA, seqA] = a.split('-').map(Number);
  const [msB, seqB] = b.split('-').map(Number);

  if (msA !== msB) {
    return (msA ?? 0) - (msB ?? 0);
  }

  return (seqA ?? 0) - (seqB ?? 0);
}
