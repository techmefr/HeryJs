import { SseStreamService } from './sse-stream.service';
import type { SseEntry, SseSubscription } from './sse-stream.service';
import { SseTokenService } from './sse-token.service';

describe('tenant isolation', () => {
  const service = new SseStreamService();
  const tenantA = `tenant-a-${Date.now()}`;
  const tenantB = `tenant-b-${Date.now()}`;
  const channel = 'exports';
  const subscriptions: SseSubscription[] = [];

  afterAll(async () => {
    await Promise.all(subscriptions.splice(0).map((s) => s.stop()));
    await service.onModuleDestroy();
  });

  it('never replays an entry of tenant B to tenant A on the same channel', async () => {
    await service.publish(tenantB, channel, 'export.ready', { secret: 'b' });

    expect(await service.replaySince(tenantA, channel, '0-0')).toEqual([]);
    expect(await service.replaySince(tenantB, channel, '0-0')).toHaveLength(1);
  });

  it('never streams an entry of tenant B to a live subscriber of tenant A', async () => {
    const receivedByA: SseEntry[] = [];
    const receivedByB: SseEntry[] = [];
    subscriptions.push(
      service.subscribeLive(tenantA, 'live', '$', (entry) =>
        receivedByA.push(entry),
      ),
      service.subscribeLive(tenantB, 'live', '$', (entry) =>
        receivedByB.push(entry),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    await service.publish(tenantB, 'live', 'tick', { secret: 'b' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(receivedByB).toHaveLength(1);
    expect(receivedByA).toEqual([]);
  });

  it('never shares a stream between a tenant and channel that join into the same text', async () => {
    const suffix = Date.now();
    await service.publish(`a:x${suffix}`, 'y', 'tick', { secret: 'first' });

    expect(await service.replaySince('a', `x${suffix}:y`, '0-0')).toEqual([]);
    expect(await service.replaySince(`a:x${suffix}`, 'y', '0-0')).toHaveLength(
      1,
    );
  });

  it('binds the stream token to the tenant it was issued for', () => {
    const tokens = new SseTokenService();
    const [body, signature] = tokens.issue(tenantA).split('.');
    const forged = Buffer.from(
      JSON.stringify({ tenantId: tenantB, exp: Date.now() + 60_000 }),
    ).toString('base64url');

    expect(tokens.verify(`${body}.${signature}`)?.tenantId).toBe(tenantA);
    expect(tokens.verify(`${forged}.${signature}`)).toBeNull();
  });
});
