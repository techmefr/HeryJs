import { Injectable } from '@nestjs/common';
import { notifierMailChannel } from '#kernel/notifier/notifier-mail-channel';
import { notifierPushChannel } from '#kernel/notifier/notifier-push-channel';
import {
  notifierSmsChannel,
  notifierSmsConsent,
} from '#kernel/notifier/notifier-sms-channel';
import type {
  Notification,
  NotificationRecipient,
  NotifierChannelResult,
} from './notification';

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Notify this user, by whatever channel they have agreed to.
 *
 * Composes the three existing driver-backed modules rather than swapping
 * between implementations of its own, so it is a facade over mail, sms and
 * push and not a fourth driver-registry module. It reaches each of them
 * through a kernel-resolved channel token rather than an import -- see
 * `#kernel/notifier/notifier-mail-channel` -- because `notifier` may not
 * import another module any more than any other module may.
 *
 * Each channel is attempted independently and reports its own result, never
 * throwing just because one of the others failed -- an email delivered and an
 * SMS refused is a partial success, and the caller can tell the two apart.
 */
@Injectable()
export class NotifierService {
  async send(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotifierChannelResult[]> {
    const results = await Promise.all([
      this.sendMail(recipient, notification),
      this.sendSms(recipient, notification),
      this.sendPush(recipient, notification),
    ]);

    return results.filter(
      (result): result is NotifierChannelResult => result !== null,
    );
  }

  private async sendMail(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotifierChannelResult | null> {
    if (!notification.toMail) {
      return null;
    }

    const channel = notifierMailChannel();

    if (!channel) {
      return {
        channel: 'mail',
        status: 'skipped',
        reason: 'The mail module is not installed.',
      };
    }

    if (!recipient.email) {
      return {
        channel: 'mail',
        status: 'skipped',
        reason: 'Recipient has no email address.',
      };
    }

    try {
      const message = await notification.toMail(recipient);

      await channel.send({ to: recipient.email, build: () => message });

      return { channel: 'mail', status: 'delivered' };
    } catch (error) {
      return { channel: 'mail', status: 'failed', reason: errorReason(error) };
    }
  }

  /**
   * Consent is resolved here, once, rather than left to the sms module: its
   * own guard only asks for it on a `marketing` send, and a notification is
   * neither -- it is triggered by something the recipient did, the same as
   * every other channel here. Reading consent through its own kernel token is
   * what keeps it from being a concept only the sms module knows about, which
   * is the whole complaint this module exists to answer.
   */
  private async sendSms(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotifierChannelResult | null> {
    if (!notification.toSms) {
      return null;
    }

    const channel = notifierSmsChannel();
    const consent = notifierSmsConsent();

    if (!channel || !consent) {
      return {
        channel: 'sms',
        status: 'skipped',
        reason: 'The sms module is not installed.',
      };
    }

    if (!recipient.phone) {
      return {
        channel: 'sms',
        status: 'skipped',
        reason: 'Recipient has no phone number.',
      };
    }

    const decision = await consent.decisionFor(recipient.phone);

    if (!decision.granted) {
      return {
        channel: 'sms',
        status: 'skipped',
        reason: 'No SMS consent recorded for this recipient.',
      };
    }

    try {
      const message = await notification.toSms(recipient);

      await channel.send({ ...message, to: recipient.phone });

      return { channel: 'sms', status: 'delivered' };
    } catch (error) {
      return { channel: 'sms', status: 'failed', reason: errorReason(error) };
    }
  }

  private async sendPush(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotifierChannelResult | null> {
    if (!notification.toPush) {
      return null;
    }

    const channel = notifierPushChannel();

    if (!channel) {
      return {
        channel: 'push',
        status: 'skipped',
        reason: 'The push module is not installed.',
      };
    }

    if (!recipient.userId) {
      return {
        channel: 'push',
        status: 'skipped',
        reason: 'Recipient has no user id to look devices up for.',
      };
    }

    try {
      const message = await notification.toPush(recipient);
      const delivery = await channel.sendToUser(recipient.userId, message);

      if (delivery.sent > 0) {
        return { channel: 'push', status: 'delivered' };
      }

      if (delivery.expired + delivery.failed === 0) {
        return {
          channel: 'push',
          status: 'skipped',
          reason: 'Recipient has no registered device.',
        };
      }

      return {
        channel: 'push',
        status: 'failed',
        reason: `0 of ${delivery.expired + delivery.failed} device(s) reached.`,
      };
    } catch (error) {
      return { channel: 'push', status: 'failed', reason: errorReason(error) };
    }
  }
}
