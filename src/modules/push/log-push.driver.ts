import { Injectable, Logger } from '@nestjs/common';
import type {
  PushDriver,
  PushMessage,
  PushOutcome,
  PushPlatform,
} from '#technical/push/push-driver';

/**
 * The zero-config default: it implements the contract and writes to the
 * logger. It never reports a token expired, because it has no way to know --
 * and inventing that answer would delete real devices from a project that only
 * wanted to see what it was sending.
 */
@Injectable()
export class LogPushDriver implements PushDriver {
  private readonly logger = new Logger('Push');

  send(
    token: string,
    platform: PushPlatform,
    message: PushMessage,
  ): Promise<PushOutcome> {
    this.logger.log(
      `to=${token.slice(0, 12)}… platform=${platform} title="${message.title}"`,
    );

    return Promise.resolve('sent');
  }
}
