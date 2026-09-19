import type { MailMessage } from '#kernel/mail/mail-driver';
import { setNotifierMailChannel } from '#kernel/notifier/notifier-mail-channel';
import type { NotifierMailChannel } from '#kernel/notifier/notifier-mail-channel';
import { setNotifierPushChannel } from '#kernel/notifier/notifier-push-channel';
import type {
  NotifierPushChannel,
  NotifierPushDelivery,
} from '#kernel/notifier/notifier-push-channel';
import {
  setNotifierSmsChannel,
  setNotifierSmsConsent,
} from '#kernel/notifier/notifier-sms-channel';
import type {
  NotifierSmsChannel,
  NotifierSmsConsentDecision,
} from '#kernel/notifier/notifier-sms-channel';
import type { PushMessage } from '#kernel/push/push-driver';
import type { SmsMessage } from '#kernel/sms/sms-driver';
import type { Notification, NotificationRecipient } from './notification';
import { NotifierService } from './notifier.service';

function stubMail(sent: MailMessage[], fail = false): NotifierMailChannel {
  return {
    send: (mailable) => {
      if (fail) {
        return Promise.reject(new Error('smtp refused'));
      }

      return Promise.resolve(mailable.build()).then((message) => {
        sent.push(message);
      });
    },
  };
}

function stubSms(sent: SmsMessage[], fail = false): NotifierSmsChannel {
  return {
    send: (message) => {
      if (fail) {
        return Promise.reject(new Error('sms refused'));
      }

      sent.push(message);

      return Promise.resolve();
    },
  };
}

function stubConsent(decision: NotifierSmsConsentDecision): {
  decisionFor: () => Promise<NotifierSmsConsentDecision>;
} {
  return { decisionFor: () => Promise.resolve(decision) };
}

function stubPush(delivery: NotifierPushDelivery): NotifierPushChannel {
  return { sendToUser: () => Promise.resolve(delivery) };
}

function wire(options: {
  mailSent?: MailMessage[];
  mailFails?: boolean;
  smsSent?: SmsMessage[];
  smsFails?: boolean;
  consent?: NotifierSmsConsentDecision;
  delivery?: NotifierPushDelivery;
  installMail?: boolean;
  installSms?: boolean;
  installPush?: boolean;
}): NotifierService {
  const mailSent = options.mailSent ?? [];
  const smsSent = options.smsSent ?? [];

  setNotifierMailChannel(
    options.installMail === false
      ? null
      : stubMail(mailSent, options.mailFails),
  );
  setNotifierSmsChannel(
    options.installSms === false ? null : stubSms(smsSent, options.smsFails),
  );
  setNotifierSmsConsent(
    options.installSms === false
      ? null
      : stubConsent(options.consent ?? { granted: true }),
  );
  setNotifierPushChannel(
    options.installPush === false
      ? null
      : stubPush(options.delivery ?? { sent: 1, expired: 0, failed: 0 }),
  );

  return new NotifierService();
}

const recipient: NotificationRecipient = {
  userId: 'user-1',
  email: 'ada@example.com',
  phone: '+33600000000',
};

class OrderShipped implements Notification {
  toMail(): MailMessage {
    return {
      to: '',
      subject: 'Your order shipped',
      html: '<p>On its way</p>',
    };
  }

  toSms(): SmsMessage {
    return { to: '', body: 'Your order shipped' };
  }

  toPush(): PushMessage {
    return { title: 'Shipped', body: 'Your order is on its way' };
  }
}

describe('NotifierService', () => {
  it('renders and sends the same notification on every channel it implements', async () => {
    const mailSent: MailMessage[] = [];
    const smsSent: SmsMessage[] = [];
    const service = wire({ mailSent, smsSent });

    const results = await service.send(recipient, new OrderShipped());

    expect(results).toEqual([
      { channel: 'mail', status: 'delivered' },
      { channel: 'sms', status: 'delivered' },
      { channel: 'push', status: 'delivered' },
    ]);
    expect(mailSent).toEqual([
      {
        to: 'ada@example.com',
        subject: 'Your order shipped',
        html: '<p>On its way</p>',
      },
    ]);
    expect(smsSent).toEqual([
      { to: '+33600000000', body: 'Your order shipped' },
    ]);
  });

  // A notification class that never implements toSms is a design choice, not
  // a failure -- it should not appear in the result at all.
  it('says nothing about a channel the notification does not implement', async () => {
    class MailOnly implements Notification {
      toMail(): MailMessage {
        return { to: '', subject: 'Hi', html: '<p>Hi</p>' };
      }
    }

    const service = wire({});

    const results = await service.send(recipient, new MailOnly());

    expect(results).toEqual([{ channel: 'mail', status: 'delivered' }]);
  });

  it('reports a partial success when one channel fails and the others succeed', async () => {
    const service = wire({ mailFails: true });

    const results = await service.send(recipient, new OrderShipped());

    expect(results).toEqual([
      { channel: 'mail', status: 'failed', reason: 'smtp refused' },
      { channel: 'sms', status: 'delivered' },
      { channel: 'push', status: 'delivered' },
    ]);
  });

  it('skips sms when no consent is recorded for the recipient, without touching the other channels', async () => {
    const service = wire({ consent: { granted: false } });

    const results = await service.send(recipient, new OrderShipped());

    expect(results).toEqual([
      { channel: 'mail', status: 'delivered' },
      {
        channel: 'sms',
        status: 'skipped',
        reason: 'No SMS consent recorded for this recipient.',
      },
      { channel: 'push', status: 'delivered' },
    ]);
  });

  it('skips a channel the recipient has no address for', async () => {
    const service = wire({});

    const results = await service.send(
      { userId: 'user-1' },
      new OrderShipped(),
    );

    expect(results).toEqual([
      {
        channel: 'mail',
        status: 'skipped',
        reason: 'Recipient has no email address.',
      },
      {
        channel: 'sms',
        status: 'skipped',
        reason: 'Recipient has no phone number.',
      },
      { channel: 'push', status: 'delivered' },
    ]);
  });

  it('reports push as failed once every device refuses, and skipped once none exist', async () => {
    const failed = wire({ delivery: { sent: 0, expired: 1, failed: 0 } });
    const none = wire({ delivery: { sent: 0, expired: 0, failed: 0 } });

    const failedResult = await failed.send(recipient, new OrderShipped());
    const noneResult = await none.send(recipient, new OrderShipped());

    expect(failedResult).toContainEqual({
      channel: 'push',
      status: 'failed',
      reason: '0 of 1 device(s) reached.',
    });
    expect(noneResult).toContainEqual({
      channel: 'push',
      status: 'skipped',
      reason: 'Recipient has no registered device.',
    });
  });

  it('skips every channel whose module is not installed', async () => {
    const service = wire({
      installMail: false,
      installSms: false,
      installPush: false,
    });

    const results = await service.send(recipient, new OrderShipped());

    expect(results).toEqual([
      {
        channel: 'mail',
        status: 'skipped',
        reason: 'The mail module is not installed.',
      },
      {
        channel: 'sms',
        status: 'skipped',
        reason: 'The sms module is not installed.',
      },
      {
        channel: 'push',
        status: 'skipped',
        reason: 'The push module is not installed.',
      },
    ]);
  });
});
