import { Global, Module } from '@nestjs/common';
import { AUTH_MAILER, AuthModule } from '@heryjs/core/auth';
import { HeryConfigModule } from '@heryjs/core/config';
import { DriversModule } from '@heryjs/core/drivers';
import { JobsModule } from '@heryjs/core/jobs';
import { PrismaModule } from '@heryjs/core/database';
import { PrivacyModule } from '@heryjs/core/privacy';
import { NOTIFIER_MAIL_CHANNEL } from '@heryjs/core/notifications';
import { AUTH_MAILER_PROVIDER, AuthMailAdapter } from './auth-mail.adapter';
import { LogMailDriver } from './log-mail.driver';
import { MailAdminController } from './mail-admin.controller';
import { MailController } from './mail.controller';
import { MailDriverRegistry } from './mail-driver.registry';
import { MailProcessor } from './mail.processor';
import { MailPersonalData } from './mail.personal-data';
import { MailService } from './mail.service';
import './mail.catalogue';

// Global because the kernel's auth flows resolve AUTH_MAILER by token from
// outside this module's import graph, the same way every driver is found.
@Global()
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JobsModule,
    HeryConfigModule,
    DriversModule,
    PrivacyModule,
  ],
  controllers: [MailController, MailAdminController],
  providers: [
    MailService,
    MailPersonalData,
    MailProcessor,
    MailDriverRegistry,
    LogMailDriver,
    AuthMailAdapter,
    AUTH_MAILER_PROVIDER,
    // Lets the notifier module reach mail without importing it -- see
    // `#technical/notifier/notifier-mail-channel` for why this is a token rather
    // than an export.
    { provide: NOTIFIER_MAIL_CHANNEL, useExisting: MailService },
  ],
  exports: [MailService, AUTH_MAILER, NOTIFIER_MAIL_CHANNEL],
})
export class MailModule {}
