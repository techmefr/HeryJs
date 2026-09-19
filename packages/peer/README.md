# @heryjs/peer

WebRTC signalling and TURN credentials over the socket.io gateway the live module already runs -- offer/answer/ICE exchange, capability-gated rooms, presence. No media server, no SFU, no recording.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/). It is
already installable from any HeryJs project, so there is nothing to add to your
`package.json`:

```bash
pnpm hery install live
pnpm hery install peer
```

The install copies this package's `src/runtime/` into `src/modules/peer` and prints
what is left for you to wire up. From then on the code is yours: it is never
resynchronised, and updating this package does not touch what it wrote.

`peer` requires `live` to already be installed -- it signals over the same
Socket.IO gateway and reuses `LiveAuthGuard`/`withTenant` rather than opening a
second WebSocket server with a second auth path.

## What you get

Real files in your own `src/`, formatted by your prettier and checked by your
tsc, importing your kernel through `#technical/`. There is no runtime here that
stays resident and no configuration read at boot — the module runs once and
disappears.

## Documentation

- [Peer-to-peer signalling](https://techmefr.github.io/HeryJs/guides/peer/) — rooms, TURN credentials, presence, and the documented ICE-failure fallback
- [Modules](https://techmefr.github.io/HeryJs/guides/modules/) — what a module may do, and what installing one changes
- [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/) — the same contract this package satisfies

Licensed MIT, like the framework.
