import { Module } from '@nestjs/common';
import { NotifierMailChannelResolver } from '#technical/notifier/notifier-mail-channel';
import { NotifierPushChannelResolver } from '#technical/notifier/notifier-push-channel';
import { NotifierSmsChannelResolver } from '#technical/notifier/notifier-sms-channel';
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
