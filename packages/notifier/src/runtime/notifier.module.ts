import { Module } from '@nestjs/common';
import { NotifierMailChannelResolver } from '#kernel/notifier/notifier-mail-channel';
import { NotifierPushChannelResolver } from '#kernel/notifier/notifier-push-channel';
import { NotifierSmsChannelResolver } from '#kernel/notifier/notifier-sms-channel';
import { NotifierService } from './notifier.service';

@Module({
  providers: [
    NotifierService,
    NotifierMailChannelResolver,
    NotifierSmsChannelResolver,
    NotifierPushChannelResolver,
  ],
  exports: [NotifierService],
})
export class NotifierModule {}
