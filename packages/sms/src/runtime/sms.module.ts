import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { NOTIFIER_SMS_CONSENT } from '#kernel/notifier/notifier-sms-channel';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { LogSmsDriver } from './log-sms.driver';
import { SmsConsentService } from './sms.consent';
import { SmsDriverRegistry } from './sms-driver.registry';
import { SMS_NOTIFIER_CHANNEL_PROVIDER } from './sms-notifier.adapter';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule, HeryConfigModule, DriversModule],
  providers: [
    SmsService,
    SmsConsentService,
    SmsDriverRegistry,
    LogSmsDriver,
    // Let the notifier module reach sms without importing it -- see
    // `#kernel/notifier/notifier-sms-channel` for why these are tokens rather
    // than exports.
    SMS_NOTIFIER_CHANNEL_PROVIDER,
    { provide: NOTIFIER_SMS_CONSENT, useExisting: SmsConsentService },
  ],
  exports: [
    SmsService,
    SmsConsentService,
    SMS_NOTIFIER_CHANNEL_PROVIDER.provide,
    NOTIFIER_SMS_CONSENT,
  ],
})
export class SmsModule {}
