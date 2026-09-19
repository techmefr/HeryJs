import { Global, Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { AUTH_MAILER } from '#technical/auth/auth-mailer';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { NOTIFIER_MAIL_CHANNEL } from '#technical/notifier/notifier-mail-channel';
import { AUTH_MAILER_PROVIDER, AuthMailAdapter } from './auth-mail.adapter';
import { LogMailDriver } from './log-mail.driver';
import { MailController } from './mail.controller';
import { MailDriverRegistry } from './mail-driver.registry';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

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
  ],
  controllers: [MailController],
  providers: [
    MailService,
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
