import { Injectable } from '@nestjs/common';
import type { PushMessage } from '#technical/push/push-driver';
import { PushDriverRegistry } from './push-driver.registry';
import { PushTokenService } from './push.tokens';

export interface PushDelivery {
  sent: number;
  /** Tokens the provider reported dead, and which are now gone from the table. */
  expired: number;
  failed: number;
}

@Injectable()
export class PushService {
  constructor(
    private readonly drivers: PushDriverRegistry,
    private readonly tokens: PushTokenService,
  ) {}

  /**
   * A user is a set of devices, so sending is a fan-out and the answer is a
   * count rather than a boolean: two phones reached and a stale browser
   * subscription refused is a success, and the caller has no way to know that
   * from `void`.
   *
   * Expired tokens are deleted here, on the provider's own word, because this
   * is the only moment anything learns they are dead: no provider announces it
   * out of band, and a token nobody removes is tried again on every later
   * send, forever.
   */
  async sendToUser(
    userId: string,
    message: PushMessage,
  ): Promise<PushDelivery> {
    const devices = await this.tokens.forUser(userId);
    const driver = this.drivers.active;
    const delivery: PushDelivery = { sent: 0, expired: 0, failed: 0 };
    const dead: string[] = [];

    // Sequential rather than Promise.all: a fan-out to every device of every
    // user in a broadcast is exactly the shape that opens a hundred sockets to
    // one provider and gets the whole app rate-limited.
    for (const device of devices) {
      const outcome = await driver.send(device.token, device.platform, message);

      if (outcome === 'expired') {
        dead.push(device.token);
      }

      delivery[outcome === 'expired' ? 'expired' : outcome] += 1;
    }

    await this.tokens.forget(dead);

    return delivery;
  }
}
