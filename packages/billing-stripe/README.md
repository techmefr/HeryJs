# @heryjs/billing-stripe

Verify and parse Stripe webhooks with `node:crypto` only -- no Stripe SDK.

```bash
pnpm hery install billing-stripe
```

## Why no SDK

The whole verification is one documented formula: HMAC-SHA256 of
`${timestamp}.${payload}`, compared in constant time against the `v1` value in
the `Stripe-Signature` header. Installing an SDK to compute one HMAC is the
same trade `mail-resend` already declined for its own provider: a dependency
to audit and upgrade for a handful of lines every project would otherwise have
to trust unread.

## What it parses

Only `customer.subscription.*` events become a `BillingEvent`.
`invoice.payment_failed` is not handled separately: Stripe flips a
subscription's own `status` to `past_due` the moment an invoice payment fails,
so `customer.subscription.updated` already carries what this module needs --
reconstructing a plan and a period end from an invoice's line items would be
guessing at a shape this driver has no need to guess at.

Stripe's own statuses collapse into the five this module mirrors: `unpaid`
folds into `past_due` (the subscription is not canceled yet), and
`incomplete_expired` folds into `incomplete`.

## The precondition

Every event needs `tenantId` **and** `plan` in the subscription or customer's
own `metadata`, attached when you create it in Stripe. An event missing either
is refused rather than guessed at.

## Setup

1. Register a webhook endpoint in the Stripe dashboard pointing at
   `POST /billing/webhook` on this app.
2. Set `STRIPE_WEBHOOK_SECRET` from that endpoint's signing secret.
3. `STRIPE_SIGNATURE_TOLERANCE_SECONDS` defaults to 300, matching Stripe's own
   guidance.
