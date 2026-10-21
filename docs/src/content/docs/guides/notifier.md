---
title: Notifier
description: One notification class rendered once per channel over mail, sms, push and in-app, honouring each user's preferences, quiet hours and digests, with a per-channel result instead of one verdict.
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

## What the recipient wants, not only what they can receive

A notification carries a `type` and, optionally, `isMandatory`:

```ts
class OrderShipped implements Notification {
  readonly type = 'order.shipped';
}

class PasswordReset implements Notification {
  readonly type = 'password.reset';
  readonly isMandatory = true;
}
```

`type` is what preferences are keyed on (it falls back to the class name). `toInApp` returns `{ payload }` and stores an `AppNotification` for the recipient, so the in-app bell can be opted out of like any other channel. Pass `tenantId` on the recipient when sending from a queue worker; inside a request the ambient tenant is used.

A user keeps **rules**: one row per channel and type, `enabled` or not, with `type: '*'` meaning every notification on that channel. The most specific rule wins, so "no push at all, except order updates" is two rows. With no rules, a user receives everything.

- **Quiet hours** are a `HH:mm` window in the user's own IANA timezone and may cross midnight. While one is open, `sms` and `push` come back `skipped`; `mail` and `in-app` do not interrupt anyone and still go out.
- **Digests** apply to `mail` only. A rule with `digest: true` makes the notifier store the subject instead of sending, and report `queued`. An hourly scheduled task, taken under the same cluster lock as every other task, sends one summary per user at their `digestHour` in their timezone, and deletes the batch only after the mail was accepted, so a failed send is retried the next day.
- **Mandatory** notifications skip all of it: the preferences are not even read. Consent and missing addresses still apply, since those are not preferences.

Every skip says why in the result, for example `Recipient opted out of order.shipped on sms.` or `Recipient is in quiet hours.`

### Routes

All of them act on the caller's own preferences, resolved from the session, and a body naming a `userId` is rejected.

| Route | Does |
| --- | --- |
| `GET /notification-preferences` | the caller's rules and settings |
| `PUT /notification-preferences/rules` | upsert up to 50 rules, `{ rules: [{ channel, type?, enabled, digest? }] }` |
| `DELETE /notification-preferences/rules/:channel/:type` | forget a rule, back to the default |
| `PUT /notification-preferences/settings` | `{ timezone, quietHoursStart, quietHoursEnd, digestHour }` |

Rules and settings live in tenant-scoped tables with row-level security. Held digest entries are written by workers as well as requests and read across tenants by the sweep, so that one table carries an explicit `tenantId` instead.

## Partial failure is not total failure

`send()` never throws because one channel failed. Every channel the notification implements is attempted independently, and the result is one entry per channel:

```ts
type NotifierChannelResult = {
  channel: 'mail' | 'sms' | 'push' | 'in-app';
  status: 'delivered' | 'failed' | 'skipped' | 'queued';
  reason?: string;
};
```

An email delivered and an SMS refused is a partial success. The caller reads the array and knows exactly which channel needs attention, instead of catching one exception for whichever channel happened to fail first.

## Not a driver-swappable module

Mail, sms and push each have a registry and a `log` default because the transport genuinely varies per project. The notifier composes fixed, already-installed services — there is nothing underneath it to swap, so it ships as a single implementation rather than a fourth contract-and-driver pair.
