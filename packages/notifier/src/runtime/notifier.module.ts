import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { NotificationsModule } from '#kernel/notifications/notifications.module';
import { NotifierMailChannelResolver } from '#kernel/notifier/notifier-mail-channel';
import { NotifierPushChannelResolver } from '#kernel/notifier/notifier-push-channel';
import { NotifierSmsChannelResolver } from '#kernel/notifier/notifier-sms-channel';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { SchedulerModule } from '#kernel/scheduler/scheduler.module';
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
