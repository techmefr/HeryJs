import { randomUUID } from 'node:crypto';
import { waitFor } from '#devtools/testing/wait-for';
import { RedisChangeFeedBackend } from './redis-change-feed.backend';
import type {
  ChangeFeedEnvelope,
  ChangeFeedPresenceMember,
} from './change-feed.types';

const sentinelTenant = `sentinel-${randomUUID()}`;

/**
 * Redis delivers the messages of one subscriber connection in publish order,
 * so once a message published afterwards has arrived, anything that should
 * have arrived before it already has.
 */
async function afterPublishesSettle(
  publisher: RedisChangeFeedBackend,
  subscriber: RedisChangeFeedBackend,
): Promise<void> {
  const seen: ChangeFeedEnvelope[] = [];
  const stop = await subscriber.subscribe(sentinelTenant, (e) => seen.push(e));

  await publisher.publish(envelope(sentinelTenant));
  await waitFor(() => seen.length > 0, {
    description: 'the sentinel envelope',
  });
  await stop();
}

function envelope(tenantId: string): ChangeFeedEnvelope {
  return {
    type: 'broadcast',
    tenantId,
    channel: 'posts',
    event: 'ping',
    payload: {},
    from: 'user-1',
    fromConnectionId: 'connection-1',
  };
}

function member(connectionId: string): ChangeFeedPresenceMember {
  return {
    connectionId,
    userId: 'user-1',
    state: {},
    joinedAt: new Date().toISOString(),
  };
}

describe('RedisChangeFeedBackend (real redis)', () => {
  const processA = new RedisChangeFeedBackend();
  const processB = new RedisChangeFeedBackend();
  const tenantA = `tenant-${randomUUID()}`;
  const tenantB = `tenant-${randomUUID()}`;

  afterAll(async () => {
    await processA.onModuleDestroy();
    await processB.onModuleDestroy();
  });

  it('carries an envelope from one process to a subscriber in another', async () => {
    const seen: ChangeFeedEnvelope[] = [];
    const stop = await processB.subscribe(tenantA, (e) => seen.push(e));

    await processA.publish(envelope(tenantA));
    await afterPublishesSettle(processA, processB);
    await stop();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'broadcast', tenantId: tenantA });
  });

  it('keeps one tenant topic away from another tenant subscriber', async () => {
    const seenByA: ChangeFeedEnvelope[] = [];
    const seenByB: ChangeFeedEnvelope[] = [];
    const stopA = await processB.subscribe(tenantA, (e) => seenByA.push(e));
    const stopB = await processB.subscribe(tenantB, (e) => seenByB.push(e));

    await processA.publish(envelope(tenantB));
    await afterPublishesSettle(processA, processB);
    await stopA();
    await stopB();

    expect(seenByA).toEqual([]);
    expect(seenByB).toHaveLength(1);
  });

  it('stops delivering once the last listener of a tenant unsubscribes', async () => {
    const seen: ChangeFeedEnvelope[] = [];
    const stop = await processB.subscribe(tenantA, (e) => seen.push(e));
    await stop();

    await processA.publish(envelope(tenantA));
    await afterPublishesSettle(processA, processB);

    expect(seen).toEqual([]);
  });

  it('shares one topic subscription between listeners of the same tenant', async () => {
    const first: ChangeFeedEnvelope[] = [];
    const second: ChangeFeedEnvelope[] = [];
    const stopFirst = await processB.subscribe(tenantA, (e) => first.push(e));
    const stopSecond = await processB.subscribe(tenantA, (e) => second.push(e));

    await stopFirst();
    await processA.publish(envelope(tenantA));
    await afterPublishesSettle(processA, processB);
    await stopSecond();

    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
  });

  it('lists presence across processes, scoped to the tenant and channel', async () => {
    await processA.joinPresence(tenantA, 'posts', member('a-1'), 60_000);
    await processB.joinPresence(tenantA, 'posts', member('b-1'), 60_000);
    await processB.joinPresence(tenantB, 'posts', member('other'), 60_000);

    const members = await processA.listPresence(tenantA, 'posts');

    expect(members.map((m) => m.connectionId).sort()).toEqual(['a-1', 'b-1']);
  });

  it('forgets a member that leaves and hands back who left', async () => {
    await processA.joinPresence(tenantA, 'docs', member('a-1'), 60_000);

    expect(
      (await processB.leavePresence(tenantA, 'docs', 'a-1'))?.connectionId,
    ).toBe('a-1');
    expect(await processB.leavePresence(tenantA, 'docs', 'a-1')).toBeNull();
    expect(await processA.listPresence(tenantA, 'docs')).toEqual([]);
  });

  it('drops a member whose heartbeat stopped, as a crashed process leaves it', async () => {
    await processA.joinPresence(tenantA, 'stale', member('ghost'), 50);
    await processA.joinPresence(tenantA, 'stale', member('alive'), 60_000);
    const members = await waitFor(
      async () => {
        const listed = await processB.listPresence(tenantA, 'stale');

        return listed.length === 1 ? listed : null;
      },
      { description: 'the ghost member to expire' },
    );

    expect(members.map((m) => m.connectionId)).toEqual(['alive']);
  });

  it('ignores a garbage message on a tenant topic', async () => {
    const seen: ChangeFeedEnvelope[] = [];
    const stop = await processB.subscribe(tenantA, (e) => seen.push(e));
    const publisher = (
      processA as unknown as {
        publisher: { publish(topic: string, message: string): Promise<number> };
      }
    ).publisher;

    await publisher.publish(`change-feed:${tenantA}`, 'not json');
    await publisher.publish(
      `change-feed:${tenantA}`,
      JSON.stringify(envelope(tenantB)),
    );
    await afterPublishesSettle(processA, processB);
    await stop();

    expect(seen).toEqual([]);
  });
});
