import { Global, Module } from '@nestjs/common';
import { mailDriverToken } from '#kernel/public/drivers';
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
