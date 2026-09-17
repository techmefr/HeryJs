import type {
  PushDriver,
  PushMessage,
  PushOutcome,
} from '#technical/push/push-driver';
import { PushDriverRegistry } from './push-driver.registry';
import { PushService } from './push.service';
import { PushTokenService } from './push.tokens';
import type { DeviceToken } from './push.tokens';

const message: PushMessage = { title: 'Ready', body: 'Your export is ready' };

function fakeDriver(outcomes: Record<string, PushOutcome>): PushDriver {
  // Fewer parameters than the contract declares, which TypeScript allows and
  // which says plainly that only the token decides the outcome here.
  return {
    send: (token: string) => Promise.resolve(outcomes[token] ?? 'sent'),
  };
}

function fakeTokens(devices: DeviceToken[]) {
  const forgotten: string[] = [];
  const service = {
    forUser: () => Promise.resolve(devices),
    forget: (tokens: string[]) => {
      forgotten.push(...tokens);
      return Promise.resolve();
    },
  } as unknown as PushTokenService;

  return { service, forgotten };
}

function build(devices: DeviceToken[], outcomes: Record<string, PushOutcome>) {
  const tokens = fakeTokens(devices);
  const registry = { active: fakeDriver(outcomes) } as PushDriverRegistry;

  return { service: new PushService(registry, tokens.service), tokens };
}

const laptop: DeviceToken = { id: '1', token: 'web-1', platform: 'web' };
const phone: DeviceToken = { id: '2', token: 'ios-1', platform: 'ios' };

describe('PushService', () => {
  it('sends to every device a user has', async () => {
    const { service } = build([laptop, phone], {});

    expect(await service.sendToUser('user-1', message)).toEqual({
      sent: 2,
      expired: 0,
      failed: 0,
    });
  });

  /**
   * The behaviour the whole module exists for. A provider only ever reports a
   * dead token in response to a send, so this is the single moment anything
   * learns the device is gone. A token nobody removes is retried on every
   * later send, forever, and counted as a reachable user every time.
   */
  it('forgets a token the provider reports dead', async () => {
    const { service, tokens } = build([laptop, phone], { 'web-1': 'expired' });

    const delivery = await service.sendToUser('user-1', message);

    expect(delivery).toEqual({ sent: 1, expired: 1, failed: 0 });
    expect(tokens.forgotten).toEqual(['web-1']);
  });

  // A failure is the provider being unreachable or refusing once; the device
  // is still real, and deleting it would lose a user over a blip.
  it('keeps a token that merely failed', async () => {
    const { service, tokens } = build([laptop, phone], { 'web-1': 'failed' });

    const delivery = await service.sendToUser('user-1', message);

    expect(delivery).toEqual({ sent: 1, expired: 0, failed: 1 });
    expect(tokens.forgotten).toEqual([]);
  });

  // Partial delivery is the normal case with several devices, so the answer is
  // a count: a caller handed `void` could not tell two phones reached from
  // none.
  it('reports a partial delivery rather than one verdict', async () => {
    const { service } = build([laptop, phone], {
      'web-1': 'expired',
      'ios-1': 'failed',
    });

    expect(await service.sendToUser('user-1', message)).toEqual({
      sent: 0,
      expired: 1,
      failed: 1,
    });
  });

  it('touches nothing for a user with no device registered', async () => {
    const { service, tokens } = build([], {});

    expect(await service.sendToUser('user-1', message)).toEqual({
      sent: 0,
      expired: 0,
      failed: 0,
    });
    expect(tokens.forgotten).toEqual([]);
  });
});
