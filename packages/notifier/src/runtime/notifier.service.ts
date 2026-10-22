import { Inject, Injectable } from '@nestjs/common';
import { recipientLocale, runInLocale } from '#kernel/i18n/recipient-locale';
import { notifierMailChannel } from '#kernel/notifier/notifier-mail-channel';
import { notifierPushChannel } from '#kernel/notifier/notifier-push-channel';
import {
  notifierSmsChannel,
  notifierSmsConsent,
} from '#kernel/notifier/notifier-sms-channel';
import { NOTIFICATION_PROVIDER } from '#kernel/notifications/notification.types';
import type { NotificationProvider } from '#kernel/notifications/notification.types';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { decideDelivery } from './delivery-policy';
import type { DeliveryDecision } from './delivery-policy';
import type {
  Notification,
  NotificationRecipient,
  NotifierChannel,
  NotifierChannelResult,
} from './notification';
import { NotificationDigestService } from './notification-digest.service';
import { NotificationPreferenceService } from './notification-preference.service';
import type { NotificationRules } from './notification-rules';

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function typeOf(notification: Notification): string {
  return notification.type ?? notification.constructor.name;
}

const HELD_FOR_DIGEST = 'Held for the next digest.';

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
  constructor(
    private readonly preferences: NotificationPreferenceService,
    private readonly digests: NotificationDigestService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly inApp: NotificationProvider,
  ) {}

  /**
   * Every channel renders inside the recipient's locale, so a notification's
   * `toMail`, `toSms` and `toPush` write in their language by calling
   * `translateMessage()` -- not in the language of whoever triggered it.
   */
  async send(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotifierChannelResult[]> {
    const locale = await this.localeOf(recipient);

    return runInLocale(locale, () => {
      if (recipient.tenantId) {
        return runInTenant(recipient.tenantId, () =>
          this.dispatch(recipient, notification),
        );
      }

      return this.dispatch(recipient, notification);
    });
  }

  private async localeOf(recipient: NotificationRecipient): Promise<string> {
    if (recipient.locale !== undefined || !recipient.userId) {
      return recipientLocale(recipient);
    }

    return recipientLocale({
      locale: await this.preferences.localeOf(recipient.userId),
    });
  }

  private async dispatch(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotifierChannelResult[]> {
    const rules = await this.rulesFor(recipient, notification);
    const now = new Date();
    const decide = (channel: NotifierChannel): DeliveryDecision =>
      decideDelivery({
        channel,
        type: typeOf(notification),
        isMandatory: notification.isMandatory === true,
        rules,
        now,
      });

    const results = await Promise.all([
      this.sendMail(recipient, notification, decide('mail')),
      this.sendSms(recipient, notification, decide('sms')),
      this.sendPush(recipient, notification, decide('push')),
      this.sendInApp(recipient, notification, decide('in-app')),
    ]);

    return results.filter(
      (result): result is NotifierChannelResult => result !== null,
    );
  }

  private async rulesFor(
    recipient: NotificationRecipient,
    notification: Notification,
  ): Promise<NotificationRules | null> {
    if (notification.isMandatory === true || !recipient.userId) {
      return null;
    }

    return this.preferences.rulesFor(recipient.userId);
  }

  private async sendMail(
    recipient: NotificationRecipient,
    notification: Notification,
    decision: DeliveryDecision,
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

    if (decision.action === 'skip') {
      return { channel: 'mail', status: 'skipped', reason: decision.reason };
    }

    try {
      const message = await notification.toMail(recipient);

      if (decision.action === 'digest' && recipient.userId) {
        await this.digests.hold({
          tenantId: recipient.tenantId ?? TenantContextStorage.getTenantId(),
          userId: recipient.userId,
          email: recipient.email,
          type: typeOf(notification),
          subject: message.subject,
        });

        return { channel: 'mail', status: 'queued', reason: HELD_FOR_DIGEST };
      }

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
    decision: DeliveryDecision,
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

    if (decision.action === 'skip') {
      return { channel: 'sms', status: 'skipped', reason: decision.reason };
    }

    const consented = await consent.decisionFor(recipient.phone);

    if (!consented.granted) {
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
    decision: DeliveryDecision,
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

    if (decision.action === 'skip') {
      return { channel: 'push', status: 'skipped', reason: decision.reason };
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

  private async sendInApp(
    recipient: NotificationRecipient,
    notification: Notification,
    decision: DeliveryDecision,
  ): Promise<NotifierChannelResult | null> {
    if (!notification.toInApp) {
      return null;
    }

    if (!recipient.userId) {
      return {
        channel: 'in-app',
        status: 'skipped',
        reason: 'Recipient has no user id to store the notification for.',
      };
    }

    if (decision.action === 'skip') {
      return { channel: 'in-app', status: 'skipped', reason: decision.reason };
    }

    try {
      const message = await notification.toInApp(recipient);

      await this.inApp.send(
        recipient.userId,
        typeOf(notification),
        message.payload,
      );

      return { channel: 'in-app', status: 'delivered' };
    } catch (error) {
      return {
        channel: 'in-app',
        status: 'failed',
        reason: errorReason(error),
      };
    }
  }
}
