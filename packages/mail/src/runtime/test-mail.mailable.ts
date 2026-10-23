import type { Mailable, MailMessage } from '#kernel/public/drivers';
import { mailLayout } from './mail.layout';

/**
 * What the admin's "send test mail" sends: the smallest message that proves
 * the whole path, queue, job, driver and transport, works end to end.
 */
export class TestMail implements Mailable {
  constructor(readonly to: string) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: 'HeryJs test mail',
      html: mailLayout('<p>If you can read this, mail is wired up.</p>', {
        title: 'HeryJs test mail',
      }),
    };
  }
}
