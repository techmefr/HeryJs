import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { ResendMailModule } from './resend-mail.module';

export default defineHeryModule({
  name: '@heryjs/mail-resend',
  module: () => ResendMailModule,
  options: noOptions,
  requires: ['@heryjs/mail'],
  extensionPoints: ['mail.driver'],
});
