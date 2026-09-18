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

LaunchDarkly or Unleash would ship the same way `mail-resend` does: a package whose `dest` points at this folder's own driver machinery and that binds `featureFlagDriverToken('launchdarkly')` from outside the kernel. That package does not exist yet — this guide documents the convention and the `local` driver it makes swappable, not a specific provider. `.dependency-cruiser.cjs` is why the contract lives in `src/technical/feature-flags/feature-flags-driver.ts` rather than beside the service: a driver package can never import a module, so a contract a module owned would be unreachable from the driver meant to implement it.

## A declared provider that is not installed fails at boot

Same rule as mail and sms: `hery.config.ts` naming a driver with no matching package installed is a startup failure, never a silent fallback to `local`. An app that quietly checks Postgres instead of the intended provider is worse than one that refuses to start, because a flag meant to gate a rollout would look consistently off instead of raising an error anyone would notice.
