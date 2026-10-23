import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import {
  NotificationsModule,
  NotifierMailChannelResolver,
  NotifierPushChannelResolver,
  NotifierSmsChannelResolver,
} from '@heryjs/core/notifications';
import { PrismaModule } from '@heryjs/core/database';
import { SchedulerModule } from '@heryjs/core/jobs';
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
