import { SseStreamService } from './sse-stream.service';
import type { SseEntry, SseSubscription } from './sse-stream.service';

function collect(entries: SseEntry[]) {
  return entries.map(({ event, payload }) => ({ event, payload }));
}

describe('SseStreamService', () => {
  const service = new SseStreamService();
  const tenantId = `tenant-${Date.now()}`;
  const channel = 'exports';
  const subscriptions: SseSubscription[] = [];

  afterEach(async () => {
    await Promise.all(subscriptions.splice(0).map((s) => s.stop()));
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('replays nothing before anything was published', async () => {
    const replayable = await service.canReplay(tenantId, 'empty', '0-0');
    expect(replayable).toBe(true);

    const missed = await service.replaySince(tenantId, 'empty', '0-0');
    expect(missed).toEqual([]);
  });

  it('replays every entry published after a given id, in order', async () => {
    const firstId = await service.publish(tenantId, channel, 'export.started', {
      exportId: '1',
    });
    const secondId = await service.publish(
      tenantId,
      channel,
      'export.ready',
      { exportId: '1', url: 'https://example.test/1' },
    );

    const missed = await service.replaySince(tenantId, channel, firstId);

    expect(collect(missed)).toEqual([
      { event: 'export.ready', payload: { exportId: '1', url: 'https://example.test/1' } },
    ]);
    expect(missed[0]?.id).toBe(secondId);
  });

  it('replays nothing for a caller already caught up to the newest id', async () => {
    const latest = await service.publish(tenantId, 'caught-up', 'tick', {
      n: 1,
    });

    const missed = await service.replaySince(tenantId, 'caught-up', latest);

    expect(missed).toEqual([]);
  });

  /**
   * The behaviour the whole module exists for: a client that reconnects with
   * Last-Event-ID gets exactly what it missed, then the live tail continues
   * from that same id -- no replayed entry delivered twice, nothing dropped
   * in between the two.
   */
  it('resumes live delivery from the last replayed id with no gap and no duplicate', async () => {
    const streamChannel = 'resume';
    const beforeDisconnect = await service.publish(
      tenantId,
      streamChannel,
      'counter',
      { n: 1 },
    );

    const missedWhileDisconnected = await service.publish(
      tenantId,
      streamChannel,
      'counter',
      { n: 2 },
    );

    const missed = await service.replaySince(
      tenantId,
      streamChannel,
      beforeDisconnect,
    );
    const resumeFrom = missed[missed.length - 1]?.id ?? beforeDisconnect;

    const received: SseEntry[] = [];
    const subscription = service.subscribeLive(
      tenantId,
      streamChannel,
      resumeFrom,
      (entry) => received.push(entry),
    );
    subscriptions.push(subscription);

    const afterReconnect = await service.publish(
      tenantId,
      streamChannel,
      'counter',
      { n: 3 },
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(collect(missed)).toEqual([
      { event: 'counter', payload: { n: 2 } },
    ]);
    expect(missed[0]?.id).toBe(missedWhileDisconnected);
    expect(collect(received)).toEqual([{ event: 'counter', payload: { n: 3 } }]);
    expect(received[0]?.id).toBe(afterReconnect);
  });

  /**
   * The retention strategy: a backlog capped well below what one channel
   * could otherwise grow to forever. A client whose last id has already
   * rolled off is told the connection is stale, never handed a replay that
   * silently starts after the gap.
   */
  it('reports a backlog that has rolled off as unreplayable', async () => {
    const bounded = 'bounded';
    const firstId = await service.publish(
      tenantId,
      bounded,
      'tick',
      { n: 0 },
      2,
    );

    for (let n = 1; n <= 5; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await service.publish(tenantId, bounded, 'tick', { n }, 2);
    }

    const replayable = await service.canReplay(tenantId, bounded, firstId);

    expect(replayable).toBe(false);
  });
});
