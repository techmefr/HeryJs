import { Global, Module } from '@nestjs/common';
import { mailDriverToken } from '#kernel/mail/mail-driver';
import { SmtpMailDriver } from './smtp-mail.driver';

const TOKEN = mailDriverToken('smtp');

@Global()
@Module({
  providers: [SmtpMailDriver, { provide: TOKEN, useExisting: SmtpMailDriver }],
  exports: [TOKEN],
})
export class SmtpMailModule {}
