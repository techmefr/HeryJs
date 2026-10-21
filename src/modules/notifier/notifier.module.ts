import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { NotificationsModule } from '#technical/notifications/notifications.module';
import { NotifierMailChannelResolver } from '#technical/notifier/notifier-mail-channel';
import { NotifierPushChannelResolver } from '#technical/notifier/notifier-push-channel';
import { NotifierSmsChannelResolver } from '#technical/notifier/notifier-sms-channel';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { NotificationDigestService } from './notification-digest.service';
import { NotificationDigestTask } from './notification-digest.task';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotifierService } from './notifier.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, SchedulerModule],
  controllers: [NotificationPreferencesController],
  providers: [
    NotifierService,
    NotificationPreferenceService,
    NotificationDigestService,
    NotificationDigestTask,
    NotifierMailChannelResolver,
    NotifierSmsChannelResolver,
    NotifierPushChannelResolver,
  ],
  exports: [NotifierService, NotificationPreferenceService],
})
export class NotifierModule {}
