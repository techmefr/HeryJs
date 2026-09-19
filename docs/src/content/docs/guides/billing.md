---
title: Billing
description: Ingest subscription state from a provider behind one contract, mirror it locally, and guard a quota against it -- never the checkout or plan-management calls.
---

`@heryjs/billing` is the _ingestion_ half of billing, deliberately. It does
not create a checkout session, change a plan, or issue a refund. Those are
outbound calls to a provider's own API, and each one carries a product
decision -- proration on a mid-period plan change, what a failed payment does
during a grace period -- that this framework has no business making on a
project's behalf. What follows is what it does do.

## The webhook, verified before it is parsed

```bash
pnpm hery install billing
pnpm hery install billing-stripe
```

`POST /billing/webhook` is one fixed route, unlike the generic webhooks
module's per-tenant `/webhooks/:endpointId`: a billing provider is configured
once, in its own dashboard, against a URL you register there, and it signs
with a secret _it_ assigns.

`BillingWebhookGuard` verifies the signature and parses the payload before the
handler runs, the same shape the generic webhooks module already uses --
gated as a guard, visible in the pipeline trace, not buried inside a service.
Each event is then queued rather than mirrored inline: the provider expects a
fast response and retries on a timeout, and mirroring is a database write.

## The one precondition this module cannot enforce

A webhook event has to be attributable to a tenant, and a provider has no
concept of this framework's tenants.

**Attach `tenantId` as metadata on the subscription or customer when you
create it at the provider.** The Stripe driver also requires `plan` in that
same metadata. An event missing either is refused loudly rather than silently
dropped or, worse, mis-attributed to the wrong tenant.

## The local mirror

`BillingSubscription` is a projection of whatever the provider's webhook last
said, refreshed on every event. **Keyed on `(provider, subscriptionId)`, not
on the tenant alone** -- a tenant may hold more than one subscription, one per
product sold separately, and a single row per tenant would make a second
subscription overwrite the first.

Quota checks read this mirror, never the provider directly. Calling the
provider's API on every quota-bound request would make that request depend on
a third party's uptime and latency for something that changes a few times a
month.

## Guarding a quota

```ts
await this.billing.assertWithinQuota(tenantId, 'projects', currentCount);
```

The limit comes from `hery.config.ts`:

```ts
billingQuotas: {
  free: { projects: 3 },
  pro: { projects: 50 },
},
```

**What a plan is called and what it grants is the project's decision.** This
module resolves a number from a name; it never invents either.

A tenant holding several subscriptions that each grant the same feature takes
the **highest** limit among their plans, not the sum -- two products both
mentioning "projects" almost certainly do not mean the limits should add. A
project that does want them to add is composing two plans on purpose and can
sum the numbers itself before calling this.

### Failing closed

A tenant with no subscription mirrored at all is **refused**, not granted an
accidental unlimited plan. `billingFreePlan` opts a project into a freemium
default explicitly:

```ts
billingFreePlan: 'free',
billingQuotas: { free: { projects: 3 } },
```

### `past_due`, on purpose left to you

`active` and `trialing` grant quota by default. `past_due`, `canceled` and
`incomplete` do not. This is a real product decision -- what a failed payment
should do to a customer who is still using the product -- and the research
behind this module named it explicitly as one the framework should not make
silently. A project wanting a grace period passes the wider set in:

```ts
await this.billing.assertWithinQuota(tenantId, 'projects', currentCount, [
  'active',
  'trialing',
  'past_due',
]);
```

## Drivers

`log` ships with the module and refuses every webhook loudly. There is no
safe way to "log" a payment event the way mail's log driver safely logs
instead of sending -- a webhook only means something once a real secret
verifies it, and accepting everything because there is nothing to check
against would let anyone mint a subscription for any tenant by posting to the
route.

`billing-stripe` verifies with `node:crypto` only, no Stripe SDK -- the
verification is one documented HMAC formula, and installing an SDK to compute
it is a dependency to audit and upgrade for a handful of lines. It parses only
`customer.subscription.*` events: Stripe flips a subscription's own `status`
to `past_due` the moment an invoice payment fails, so `invoice.payment_failed`
carries nothing this module needs that `customer.subscription.updated` does
not already say.

## What is still open

Checkout, plan changes and proration are not here. See issue #34 for the
research behind that boundary, and open a new module -- or extend this one
deliberately -- once your project has made the decisions this one declined to
make for you.
