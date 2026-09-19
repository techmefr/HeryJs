import type { MailMessage } from '#technical/mail/mail-driver';
import type { PushMessage } from '#technical/push/push-driver';
import type { SmsMessage } from '#technical/sms/sms-driver';

/**
 * Whatever the notifier needs to reach someone. No field is required because
 * no channel is required: a recipient with only an email gets mail and
 * nothing else, silently, the same way one with only a phone number never
 * sees a push attempt.
 */
export interface NotificationRecipient {
  userId?: string;
  email?: string;
  phone?: string;
}

/**
 * Declared once, rendered per channel -- the whole point of this module. A
 * method a notification class does not implement is a channel it has nothing
 * to say on, not a failure: `OrderShipped` might carry `toMail` and `toPush`
 * and no `toSms` at all, and that is a design choice made once in the class
 * rather than three times across mail, sms and push call sites.
 *
 * Every method returns the exact rendered-message shape its channel's own
 * `send` already accepts (`MailMessage`, `SmsMessage`, `PushMessage`) -- never
 * a template name, so the notifier has somewhere to sit between "what to say"
 * and "how to say it" without inventing a fourth template language.
 */
export interface Notification {
  toMail?(recipient: NotificationRecipient): MailMessage | Promise<MailMessage>;

  toSms?(recipient: NotificationRecipient): SmsMessage | Promise<SmsMessage>;

  toPush?(recipient: NotificationRecipient): PushMessage | Promise<PushMessage>;
}

export type NotifierChannel = 'mail' | 'sms' | 'push';

/**
 * `skipped` is its own outcome, not folded into `failed`: nothing was
 * attempted, because the recipient has no address for the channel or never
 * consented to it, and that is not the same fact as a provider refusing a
 * message it was actually given.
 */
export type NotifierChannelStatus = 'delivered' | 'failed' | 'skipped';

export interface NotifierChannelResult {
  channel: NotifierChannel;
  status: NotifierChannelStatus;
  /** Why it was skipped or failed. Absent once a channel is delivered. */
  reason?: string;
}
