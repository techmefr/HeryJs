---
title: Feature flags
description: Per-tenant and global flags behind a driver, so an external provider is a config change rather than a rewrite.
---

Feature flags are a kernel capability, not an optional module: every generated app ships `/feature-flags` whether or not it installs anything. That is also why they used to talk to Postgres directly with no driver in between — the module-and-driver convention arrived after mail and sms already had it, and feature flags were the gap issue #88 closed.

## Checking and setting a flag

`FeatureFlagsService` is the only thing a resource ever injects:

```ts
constructor(private readonly featureFlags: FeatureFlagsService) {}

async handle(tenantId: string): Promise<void> {
  if (await this.featureFlags.isEnabled('new-checkout', tenantId)) {
    // ...
  }
}
```

`tenantId` is optional on every method. Passed, a tenant override wins when one exists and the global flag is the fallback; omitted, the call only ever sees the global flag. Nothing here names which driver answered — that is the whole point of the facade.

## Rollout and targeting

A flag is more than on or off. Besides `enabled` it carries a `rolloutPercentage` (0 to 100, default 100), a `rolloutBy` (`user` or `tenant`) and an ordered list of `rules`. The evaluation order is fixed, and the same on every instance:

1. No flag row: off. A tenant row replaces the global flag whole; it never merges with it.
2. `enabled` is false: off, whatever else is configured. This is the kill switch.
3. Rules, in order: the first rule that matches decides, `serve` true or false.
4. The percentage: the subject is in when its bucket is below the percentage. `rolloutBy: user` buckets the user and falls back to the tenant when no user is known, `tenant` buckets the tenant so every user of a tenant agrees. With no subject at all, a partial rollout is off.

The bucket is `sha256(key + : + subject)` modulo 100, so a subject keeps its answer between requests and between instances, is not in the same early slice of every flag, and raising the percentage only adds subjects.

A rule is `{ attribute, operator: in | notIn, values, serve }`. `tenant`, `user` and `plan` read the matching field of the context, any other name reads `context.attributes[name]`. A rule about an attribute the caller did not supply never matches.

```ts
await this.featureFlags.isEnabled(new-checkout, {
  tenantId,
  userId,
  plan: pro,
  attributes: { country: FR },
});
```

A bare tenant id is still accepted, as before. `evaluate` takes the same arguments and answers `{ enabled, reason, ruleIndex?, bucket? }`, which is what the preview uses.

## Editing at runtime

Nothing caches a flag, so a change is live on the next evaluation, with no redeploy. These routes answer a tenant admin and the platform operator, with a different reach:

- A **tenant admin** (`role: admin`) only ever touches its own tenant. The tenant comes from the session: an omitted `tenantId` means its own, and naming another tenant or `null` (the global flag) is refused with `403 featureFlags.operatorOnly`. `GET /feature-flags` lists its own tenant's flags only.
- The **platform operator** (a user id listed in `PLATFORM_OPERATOR_IDS`, see [Security](../guides/security/#tenant-admin-and-platform-operator)) sees every tenant, writes global flags (no `tenantId`) and any tenant's override.

The routes:

- `PATCH /feature-flags/:key` creates or updates a flag. Only the fields you send are written, so changing the percentage keeps the rules. `tenantId` in the body targets a tenant override.
- `DELETE /feature-flags/:key?tenantId=` removes a flag or an override.
- `POST /feature-flags/evaluate` with `{ key, tenantId?, userId?, plan?, attributes? }` previews the decision and its reason without writing anything.
- `GET /feature-flags` lists every flag, paged.

The admin panel has a Feature flags page over these: create a flag, set the rollout, add and reorder rules, and preview a user or tenant. It is built on the same routes, so anything it does is reachable from the API.

## The local driver is the default, not a placeholder

`local` reads and writes the tenant-scoped Prisma client, the same table this module always used. Unlike mail's `log` driver, "safe default" does not mean "does nothing": there is no unsafe action to withhold for a flag lookup, so the honest zero-config implementation is a real Postgres-backed one.

```ts
export default {
  featureFlags: {
    default: 'local',
    drivers: {
      local: { driver: 'local' },
    },
  },
} satisfies HeryConfig;
```

Leaving `featureFlags` out of `hery.config.ts` entirely is equivalent to declaring exactly this — `local` needs no configuration to work.

## An external provider is a package, not a fork

A provider implements `isEnabled`, `evaluate` (answering reason `provider` when it cannot explain itself), `list`, `listAll`, `set` and `remove`. LaunchDarkly or Unleash would ship the same way `mail-resend` does: a package whose `dest` points at this folder's own driver machinery and that binds `featureFlagDriverToken('launchdarkly')` from outside the kernel. That package does not exist yet — this guide documents the convention and the `local` driver it makes swappable, not a specific provider. `.dependency-cruiser.cjs` is why the contract lives in `src/technical/feature-flags/feature-flags-driver.ts` rather than beside the service: a driver package can never import a module, so a contract a module owned would be unreachable from the driver meant to implement it.

## A declared provider that is not installed fails at boot

Same rule as mail and sms: `hery.config.ts` naming a driver with no matching package installed is a startup failure, never a silent fallback to `local`. An app that quietly checks Postgres instead of the intended provider is worse than one that refuses to start, because a flag meant to gate a rollout would look consistently off instead of raising an error anyone would notice.
