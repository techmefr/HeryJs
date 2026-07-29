import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '../config/env';

const CHANNEL_PREFIX = 'signal:';

@Injectable()
export class SignalService implements OnModuleDestroy {
  private readonly publisher = new IORedis(env.REDIS_URL);

  publish(channel: string) {
    return this.publisher.publish(
      `${CHANNEL_PREFIX}${channel}`,
      JSON.stringify({ channel, at: Date.now() }),
    );
  }

  async onModuleDestroy() {
    await this.publisher.quit();
  }
}

export { CHANNEL_PREFIX };
