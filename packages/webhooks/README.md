# @heryjs/webhooks

Receive inbound webhooks with HMAC-SHA256 signature verification (constant-time, timestamp-tolerant against replay) and run each accepted payload through Event, Job, Notification, Audit and Signal.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/). It is
already installable from any HeryJs project, so there is nothing to add to your
`package.json`:

```bash
pnpm hery install webhooks
```

The install copies this package's `src/runtime/` into `src/modules/webhooks` and prints
what is left for you to wire up. From then on the code is yours: it is never
resynchronised, and updating this package does not touch what it wrote.

## What you get

Real files in your own `src/`, formatted by your prettier and checked by your
tsc, importing your kernel through `#technical/`. There is no runtime here that
stays resident and no configuration read at boot — the module runs once and
disappears.

## Documentation

- [Modules](https://techmefr.github.io/HeryJs/guides/modules/) — what a module may do, and what installing one changes
- [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/) — the same contract this package satisfies

Licensed MIT, like the framework.
