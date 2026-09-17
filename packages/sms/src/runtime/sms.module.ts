import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { LogSmsDriver } from './log-sms.driver';
import { SmsConsentService } from './sms.consent';
import { SmsDriverRegistry } from './sms-driver.registry';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule, HeryConfigModule, DriversModule],
  providers: [SmsService, SmsConsentService, SmsDriverRegistry, LogSmsDriver],
  exports: [SmsService, SmsConsentService],
})
export class SmsModule {}
