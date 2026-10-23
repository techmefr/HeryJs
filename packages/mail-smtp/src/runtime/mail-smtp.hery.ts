import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { SmtpMailModule } from './smtp-mail.module';

export default defineHeryModule({
  name: '@heryjs/mail-smtp',
  module: () => SmtpMailModule,
  options: noOptions,
  requires: ['@heryjs/mail'],
  extensionPoints: ['mail.driver'],
});
