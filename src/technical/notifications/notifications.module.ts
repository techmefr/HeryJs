import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InAppNotificationProvider } from './in-app-notification.provider';
import { NOTIFICATION_PROVIDER } from './notification.types';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_PROVIDER, useClass: InAppNotificationProvider },
  ],
  exports: [NOTIFICATION_PROVIDER],
})
export class NotificationsModule {}
