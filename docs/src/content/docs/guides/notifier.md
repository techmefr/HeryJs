---
title: Notifier
description: One notification class rendered once per channel, dispatched independently over mail, sms and push, with a per-channel result instead of one verdict.
---

Mail, SMS and push each answer "how do I send on this one channel" correctly on their own. Together they leave the question every app actually asks unanswered: notify this user, by whatever channel they have agreed to. `notifier` is that facade — it composes the three existing modules rather than adding a fourth driver registry.

```bash
pnpm hery install mail
pnpm hery install sms
pnpm hery install push
pnpm hery install notifier
```

It requires all three. There is nothing to swap underneath it, so unlike mail, sms and push, `notifier` has no drivers of its own — installing it is the whole story.

## One notification, rendered per channel

`Notification` is an interface with one optional method per channel, each returning the exact rendered-message shape that channel's own `send` already accepts:

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
    return {
      to: '',
      body: `Order #${this.order.id} shipped. Reply STOP to opt out.`,
    };
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

Nothing here is a template name — every method hands `NotifierService` a `MailMessage`, an `SmsMessage` or a `PushMessage` directly, the same shape the mail, sms and push modules already accept from a `Mailable`, a `Sendable` or a raw send. Writing the same notification three times, once per module, is how the three drift; a class that renders itself per channel cannot.

A method a notification does not implement is a channel it has nothing to say on — `toSms` is simply absent from a notification that never goes out by text, and the notifier reports nothing for it rather than a false skip.

## Channel resolution is per recipient, not per app

`send(recipient, notification)` looks at what it was actually handed before attempting a channel:

- **mail** is skipped when `recipient.email` is absent.
- **sms** is skipped when `recipient.phone` is absent, and skipped again when no consent is recorded for that number — reusing `SmsConsentService` from the sms module, so consent stays one concept rather than something only the SMS module enforces. It is checked unconditionally, because a notification is neither the sms guard's `transactional` nor its `marketing`: the notifier answers "is this recipient reachable here" itself instead of asking the sms module to guess which kind this is.
- **push** is attempted whenever `recipient.userId` is present; a user with no registered device comes back `skipped`, not `failed` — the same distinction `PushService.sendToUser` already makes internally.

## Partial failure is not total failure

`send()` never throws because one channel failed. Every channel the notification implements is attempted independently, and the result is one entry per channel:

```ts
type NotifierChannelResult = {
  channel: 'mail' | 'sms' | 'push';
  status: 'delivered' | 'failed' | 'skipped';
  reason?: string;
};
```

An email delivered and an SMS refused is a partial success. The caller reads the array and knows exactly which channel needs attention, instead of catching one exception for whichever channel happened to fail first.

## Not a driver-swappable module

Mail, sms and push each have a registry and a `log` default because the transport genuinely varies per project. The notifier composes fixed, already-installed services — there is nothing underneath it to swap, so it ships as a single implementation rather than a fourth contract-and-driver pair.
