import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { JobsModule } from '../../technical/jobs/jobs.module';
import { PrismaModule } from '../../technical/prisma/prisma.module';
import { ConsoleMailProvider } from './console-mail.provider';
import { MailController } from './mail.controller';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { MAIL_PROVIDER } from './mail.types';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [MailController],
  providers: [
    MailService,
    MailProcessor,
    { provide: MAIL_PROVIDER, useClass: ConsoleMailProvider },
  ],
  exports: [MailService],
})
export class MailModule {}
