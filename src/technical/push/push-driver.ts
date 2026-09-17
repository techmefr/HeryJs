/**
 * The push half of the module-and-driver convention: contract and token in the
 * kernel, drivers as packages, registry in the module.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const PUSH_MODULE = 'push';

export function pushDriverToken(driverName: string): symbol {
  return driverToken(PUSH_MODULE, driverName);
}

export type PushPlatform = 'web' | 'ios' | 'android';

export interface PushMessage {
  title: string;
  body: string;
  /**
   * Where tapping it goes. A push with nowhere to go is a notification the
   * recipient dismisses, which is the same as one never sent.
   */
  url?: string;
  data?: Record<string, string>;
}

/**
 * Three outcomes, not a boolean, and the middle one is the reason this
 * interface exists.
 *
 * A device token dies on its own: the app is uninstalled, the browser clears
 * its subscription, the OS rotates it. The provider knows -- it answers 410 or
 * `NotRegistered` -- and a driver that collapses that into "failed" leaves the
 * application retrying a token that will never work again, and counting a user
 * as reachable when they are not.
 */
export type PushOutcome = 'sent' | 'expired' | 'failed';

export interface PushDriver {
  send(
    token: string,
    platform: PushPlatform,
    message: PushMessage,
  ): Promise<PushOutcome>;
}
