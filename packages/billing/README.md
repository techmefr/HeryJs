# @heryjs/billing

Ingest subscription state from a billing provider behind one contract, mirror
it locally, and guard a quota against it.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install billing
```

## What this is not

This is the *ingestion* half, deliberately. It does not create a checkout
session, change a plan, or issue a refund -- those are outbound calls to the
provider's own API, and they carry product decisions (proration, what a failed
payment does mid-grace-period) that a framework should not make on a project's
behalf. See the research behind issue #34 for the reasoning.

## What it does

- `POST /billing/webhook` verifies and parses an inbound webhook behind
  `BillingWebhookGuard`, then queues each event for mirroring -- the provider
  expects a fast response, and mirroring is a database write.
- `BillingSubscription` is the local mirror: one row per (provider,
  subscription id), because a tenant may hold more than one subscription.
- `BillingService.assertWithinQuota(tenantId, feature, currentCount)` throws
  once a tenant's plan limit for a feature is reached. The limit comes from
  `hery.config.ts`'s `billingQuotas` -- what a plan is called and what it
  grants is the project's decision, never invented here.
- A tenant holding several granting subscriptions takes the **highest** limit
  among their plans for a feature, not the sum.
- No matching subscription fails **closed**: refused, not silently unlimited.
  `billingFreePlan` opts a project into a freemium default explicitly.

## The one precondition this module cannot enforce

A webhook event has to be attributable to a tenant, and a provider has no
concept of this framework's tenants. **Attach `tenantId` as metadata on the
subscription or customer when you create it** at the provider. An event
missing it is refused loudly rather than silently dropped or mis-attributed.

## Drivers

`log` ships with the module and refuses every webhook loudly: there is no
safe way to "log" a payment event the way mail's log driver safely logs
instead of sending, because a webhook only means something once a real secret
verifies it. Accepting everything because there is nothing to check against
would let anyone mint a subscription for any tenant.

A real provider is a driver package binding `billingDriverToken('<name>')`,
the way `mail-resend` does for mail. `billing-stripe` is the first one.
