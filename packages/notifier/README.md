# @heryjs/notifier

Notify a recipient by whatever channel they have agreed to: one notification
class rendered once per channel, dispatched independently over the existing
mail, sms and push modules, with a per-channel result instead of one verdict.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install notifier
```

It requires `mail`, `sms` and `push` to already be installed -- it composes
them rather than replacing them, and is not itself driver-swappable.

## Why a facade, not a fourth driver registry

Mail, SMS and push each answer "how do I send on this one channel" correctly
on their own. Together they leave the question every app actually asks
unanswered: notify this user, by whatever channel they have agreed to.

A `Notification` is declared once and renders itself per channel:

```ts
class OrderShipped implements Notification {
  constructor(private readonly order: Order) {}

  toMail(recipient: NotificationRecipient): MailMessage {
    return {
      to: recipient.email!,
      subject: 'Your order shipped',
      html: mailLayout(`<p>Order #${this.order.id} is on its way.</p>`),
    };
  }

  toSms(): SmsMessage {
    return { to: '', body: `Order #${this.order.id} shipped. Reply STOP to opt out.` };
  }

  toPush(): PushMessage {
    return {
      title: 'Shipped',
      body: `Order #${this.order.id} is on its way`,
      url: `/orders/${this.order.id}`,
    };
  }
}

await notifier.send({ userId, email, phone }, new OrderShipped(order));
```

Each method returns the exact rendered-message shape its channel already
accepts -- `MailMessage`, `SmsMessage`, `PushMessage` -- never a template name.
Writing the same notification three times, once per module, is how the three
drift; a class that renders itself per channel cannot.

## Channel resolution is per recipient, not per app

A channel is only attempted when the recipient can actually be reached on it:

- **mail** is skipped when the recipient has no email address.
- **sms** is skipped when the recipient has no phone number, and skipped again
  when no consent is recorded for it -- reusing `SmsConsentService` from the
  `sms` module rather than a second concept only the notifier knows about.
  Consent is checked here, unconditionally, because a notification is neither
  transactional nor marketing to the SMS guard's own definition; the notifier
  answers that question itself instead of asking the SMS module to guess.
- **push** is attempted whenever the recipient has a user id; a user with no
  registered device is a skip, not a failure -- the same way `PushService`
  itself treats zero devices.

## Partial failure is not total failure

`send()` never throws because one channel failed. It attempts every channel
the notification implements independently and returns one result per channel:

```ts
type NotifierChannelResult = {
  channel: 'mail' | 'sms' | 'push';
  status: 'delivered' | 'failed' | 'skipped';
  reason?: string;
};
```

An email delivered and an SMS refused is a partial success, and the caller can
tell the two apart instead of getting one exception for whichever channel
happened to fail first.
