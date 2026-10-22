import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { NOTIFIER_SMS_CONSENT } from '#technical/notifier/notifier-sms-channel';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PrivacyModule } from '#technical/privacy/privacy.module';
import { AUTH_SMS_SENDER_PROVIDER } from './auth-sms.adapter';
import { LogSmsDriver } from './log-sms.driver';
import { SmsConsentService } from './sms.consent';
import { SmsDriverRegistry } from './sms-driver.registry';
import { SmsPersonalData } from './sms.personal-data';
import { SMS_NOTIFIER_CHANNEL_PROVIDER } from './sms-notifier.adapter';
import { SmsService } from './sms.service';
import './sms.catalogue';

@Module({
  imports: [PrismaModule, HeryConfigModule, DriversModule, PrivacyModule],
  providers: [
    SmsService,
    SmsConsentService,
    SmsPersonalData,
    SmsDriverRegistry,
    LogSmsDriver,
    // Let the notifier module reach sms without importing it -- see
    // `#technical/notifier/notifier-sms-channel` for why these are tokens rather
    // than exports.
    SMS_NOTIFIER_CHANNEL_PROVIDER,
    AUTH_SMS_SENDER_PROVIDER,
    { provide: NOTIFIER_SMS_CONSENT, useExisting: SmsConsentService },
  ],
  exports: [
    SmsService,
    SmsConsentService,
    SMS_NOTIFIER_CHANNEL_PROVIDER.provide,
    AUTH_SMS_SENDER_PROVIDER.provide,
    NOTIFIER_SMS_CONSENT,
  ],
})
export class SmsModule {}
