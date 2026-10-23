import { Module } from '@nestjs/common';
import { HeryConfigModule } from '@heryjs/core/config';
import { DriversModule } from '@heryjs/core/drivers';
import { NOTIFIER_PUSH_CHANNEL } from '@heryjs/core/notifications';
import { PrismaModule } from '@heryjs/core/database';
import { LogPushDriver } from './log-push.driver';
import { PushDriverRegistry } from './push-driver.registry';
import { PushService } from './push.service';
import { PushTokenService } from './push.tokens';

@Module({
  imports: [PrismaModule, HeryConfigModule, DriversModule],
  providers: [
    PushService,
    PushTokenService,
    PushDriverRegistry,
    LogPushDriver,
    // Lets the notifier module reach push without importing it -- see
    // `#kernel/notifier/notifier-push-channel` for why this is a token rather
    // than an export.
    { provide: NOTIFIER_PUSH_CHANNEL, useExisting: PushService },
  ],
  exports: [PushService, PushTokenService, NOTIFIER_PUSH_CHANNEL],
})
export class PushModule {}
