import { Module } from '@nestjs/common';
import { OutboxModule } from '#technical/outbox/outbox.module';
import { ChangeFeedHub } from './change-feed.hub';
import { ChangeFeedPublisher } from './change-feed.publisher';
import { ChangeFeedRegistry } from './change-feed.registry';
import { CHANGE_FEED_BACKEND } from './change-feed.types';
import { ChangeFeedTokenService } from './change-feed-token.service';
import { RedisChangeFeedBackend } from './redis-change-feed.backend';

@Module({
  imports: [OutboxModule],
  providers: [
    ChangeFeedRegistry,
    ChangeFeedHub,
    ChangeFeedPublisher,
    ChangeFeedTokenService,
    { provide: CHANGE_FEED_BACKEND, useClass: RedisChangeFeedBackend },
  ],
  exports: [ChangeFeedRegistry, ChangeFeedHub, ChangeFeedTokenService],
})
export class ChangeFeedModule {}
