import { Global, Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { AUTH_MAILER } from '#kernel/auth/auth-mailer';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { JobsModule } from '#kernel/jobs/jobs.module';
import { PrismaModule } from '#kernel/prisma/prisma.module';
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
  ],
  exports: [MailService, AUTH_MAILER],
})
export class MailModule {}
