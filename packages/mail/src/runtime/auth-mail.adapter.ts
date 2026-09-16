import { Injectable } from '@nestjs/common';
import { AUTH_MAILER } from '#kernel/auth/auth-mailer';
import type { AuthMailer } from '#kernel/auth/auth-mailer';
import type { Mailable } from '#kernel/mail/mail-driver';
import { MailService } from './mail.service';

/**
 * The kernel's auth flows need to send a reset link and a verification link,
 * but the kernel may not import this module -- mail is uninstallable, and a
 * kernel that depended on it would break the day it was removed. Auth therefore
 * declares an AUTH_MAILER contract and looks it up by token; this is the module
 * side of that seam, and binding it is what turns those two emails from logged
 * warnings into real messages.
 *
 * The direction is legal in the other sense: a module may import the kernel.
 */
@Injectable()
export class AuthMailAdapter implements AuthMailer {
  constructor(private readonly mail: MailService) {}

  send(mailable: Mailable): Promise<void> {
    return this.mail.send(mailable);
  }
}

export const AUTH_MAILER_PROVIDER = {
  provide: AUTH_MAILER,
  useExisting: AuthMailAdapter,
};
