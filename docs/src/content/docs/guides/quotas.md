---
title: Quotas and usage metering
description: Per-tenant limits with a declared default and a database override, an atomic usage count, and a read route the admin panel lists, independent of any billing provider.
---

A quota is a named limit a tenant is held to: how many exports a month, how many seats in total. It needs no billing provider. [Billing](/guides/billing/) can grant a limit per plan; this layer gives every tenant a limit of its own, and counts what the tenant has used against it.

## Declaring a limit

```ts
// hery.config.ts
export default {
  quotas: {
    exports: { limit: 50, period: 'month' },
    seats: { limit: 5, period: 'total' },
  },
} satisfies HeryConfig;
```

The declaration is the default every tenant gets. `period` says when the count starts again: `month` (the default) and `day` follow the UTC calendar, `total` never resets, which suits a gauge of what a tenant holds rather than what it did. UTC is deliberate: a tenant's own timezone would move the boundary whenever it changed it, and a count that rolls over at one instant for everyone can be billed against later.

## Using it from a resource

Inject `QuotasService`. It acts on the ambient tenant, like every other tenant-scoped query.

```ts
constructor(private readonly quotas: QuotasService) {}

async export() {
  await this.quotas.consume('exports');
  // ...
}
```

| Method                  | What it does                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `check(name, amount?)`  | Reads whether `amount` more would fit. Counts nothing, and is not a reservation.                    |
| `consume(name, amount?)` | Counts `amount` and returns `{ allowed, limit, used, remaining }`, or throws `quota.exceeded` (422) without counting. |
| `usage()`               | Every declared quota with its figure for the current period.                                        |

Use `consume` where a request must not overshoot; `check` only to show a figure or grey out a button. An undeclared name throws `quota.notDeclared` (404), so a typo fails loudly rather than counting against nothing.

## Overriding a tenant

A tenant that needs more, or less, has a row in `QuotaOverride`:

```bash
curl -X PUT /quotas/exports/override \
  -d '{ "tenantId": "acme", "limit": 500 }'     # raise
curl -X PUT /quotas/exports/override \
  -d '{ "tenantId": "acme", "limit": null }'    # back to the default
```

The route is admin only, and names the tenant it applies to, so it reaches across the tenant boundary the way [feature flags](/guides/feature-flags/) do. The limit resolves as the override when there is one, otherwise the declared default.

## Reading it

`GET /quotas` returns, for the caller's tenant, one row per declared quota:

```json
{
  "data": [
    { "name": "exports", "period": "month", "periodKey": "2026-10", "limit": 50, "used": 12, "remaining": 38, "overridden": false }
  ],
  "messages": []
}
```

It is behind a capability (`canReadQuotas`, admin by default: a limit reads as a price list to a tenant that is not meant to see how its plan was cut) and in the `read` rate-limit bucket. It is an argument-free `GET`, which the [admin panel](/guides/admin/) would list on its own; the dedicated page below replaces that generic section.

## Managing it from the admin panel

Quotas have their own **Quotas** page in the [admin panel](/guides/admin/), because listing rows is not enough for editing them. It shows the declared defaults, then every tenant's usage against its limit for the current period. Per quota and tenant an operator can save a different limit, go back to the default, or reset the counter. The page is built on capability-gated routes, all admin only:

| Route                          | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `GET /quotas/defaults`         | The declared defaults                                            |
| `GET /quotas/tenants`          | Every tenant's usage and limits, paged                           |
| `PUT /quotas/:name/override`   | Set a tenant's limit, or `null` for the default                  |
| `POST /quotas/:name/reset`     | Zero a tenant's counter for the current period (`{ tenantId }`)  |

Tenants are those with at least one user, since that is where the kernel records that a tenant exists.

## How the count stays correct

Usage lives in Postgres (`QuotaUsage`, one row per tenant, name and period), not in Redis like the [rate-limit](/guides/rate-limiting/) counters. A rate limit is a window nobody needs once it closes, so losing it to a Redis flush costs seconds of leniency. A quota's count is what a tenant is held to and may later be billed on: it has to survive a restart, sit under the same row-level policy as the tenant's other rows, and stay readable for last month.

`consume` is a single `UPDATE ... WHERE used <= limit - amount`, so the check and the increment are one statement Postgres serialises on the row. Twenty requests racing for the last five units let exactly five through. A new period's row is created empty with `ON CONFLICT DO NOTHING` first, so racing creators never raise a unique violation, which would abort a surrounding `$atomic` transaction.

Both tables are tenant scoped and under a `tenant_isolation` policy like every other.

## Rate limits per tenant

The same table retunes a [rate-limit bucket](/guides/rate-limiting/) for one tenant. The name is `rate-limit:<bucket>`, and it needs no declaration:

```bash
curl -X PUT /quotas/rate-limit:write/override \
  -d '{ "tenantId": "acme", "limit": 120 }'
```

The number of hits in the window changes, the window stays the bucket's own. The guard runs on every request, so a tenant's overrides are read once and kept for thirty seconds in the process: a change is seen at once by the process that made it and within thirty seconds by the others. If the lookup fails the configured limit applies.

**Per plan is not here.** Resolving a tenant's plan means reading the billing mirror, and the kernel does not depend on the optional billing module. A project that wants plan-wide limits can set the overrides for every tenant of a plan from a subscription handler.

## What this is not

Usage-based billing, meaning pricing what was consumed and invoicing it, is the next step and is deliberately not here. `QuotaUsage` keeps one row per period so that step has the figures, but turning them into a charge belongs to a billing provider.
