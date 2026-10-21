import type { Mailable } from '#technical/mail/mail-driver';
import { setNotifierMailChannel } from '#technical/notifier/notifier-mail-channel';
import type { NotifierMailChannel } from '#technical/notifier/notifier-mail-channel';
import { setNotifierPushChannel } from '#technical/notifier/notifier-push-channel';
import type {
  NotifierPushChannel,
  NotifierPushDelivery,
} from '#technical/notifier/notifier-push-channel';
import { setNotifierSmsChannel } from '#technical/notifier/notifier-sms-channel';
import type { NotifierSmsChannel } from '#technical/notifier/notifier-sms-channel';
import type { PushMessage } from '#technical/push/push-driver';
import type { SmsMessage } from '#technical/sms/sms-driver';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export type NotifierChannelName = 'mail' | 'sms' | 'push';

export interface RecordedNotification {
  channel: NotifierChannelName;
  to: string;
  subject: string | null;
  body: string;
}

export class FakeNotifier extends RecordingFake<RecordedNotification> {
  protected readonly label = 'a notification to be delivered';

  readonly mailChannel: NotifierMailChannel = {
    send: async (mailable: Mailable): Promise<void> => {
      const message = await mailable.build();

      this.record({
        channel: 'mail',
        to: mailable.to,
        subject: message.subject,
        body: message.html,
      });
    },
  };

  readonly smsChannel: NotifierSmsChannel = {
    send: (message: SmsMessage): Promise<void> => {
      this.record({
        channel: 'sms',
        to: message.to,
        subject: null,
        body: message.body,
      });

      return Promise.resolve();
    },
  };

  readonly pushChannel: NotifierPushChannel = {
    sendToUser: (
      userId: string,
      message: PushMessage,
    ): Promise<NotifierPushDelivery> => {
      this.record({
        channel: 'push',
        to: userId,
        subject: message.title,
        body: message.body,
      });

      return Promise.resolve({ sent: 1, expired: 0, failed: 0 });
    },
  };

  get delivered(): readonly RecordedNotification[] {
    return this.all;
  }

  install(): void {
    setNotifierMailChannel(this.mailChannel);
    setNotifierSmsChannel(this.smsChannel);
    setNotifierPushChannel(this.pushChannel);
  }

  uninstall(): void {
    setNotifierMailChannel(null);
    setNotifierSmsChannel(null);
    setNotifierPushChannel(null);
  }

  assertSent(
    predicate?: RecordPredicate<RecordedNotification>,
    times?: number,
  ): void {
    this.assertRecorded(predicate, times);
  }

  assertNotSent(predicate?: RecordPredicate<RecordedNotification>): void {
    this.assertNotRecorded(predicate);
  }

  assertNothingSent(): void {
    this.assertNotRecorded();
  }
}
