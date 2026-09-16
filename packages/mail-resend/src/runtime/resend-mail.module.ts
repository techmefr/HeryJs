import { Global, Module } from '@nestjs/common';
import { mailDriverToken } from '#kernel/mail/mail-driver';
import { ResendMailDriver } from './resend-mail.driver';

const TOKEN = mailDriverToken('resend');

@Global()
@Module({
  providers: [
    ResendMailDriver,
    { provide: TOKEN, useExisting: ResendMailDriver },
  ],
  exports: [TOKEN],
})
export class ResendMailModule {}
