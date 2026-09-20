---
title: Server-Sent Events
description: The events bus, streamed to a browser -- with Last-Event-ID replay off a bounded Valkey backlog.
---

`hery install sse` adds a second SSE transport alongside the kernel's own
`signal` channel (see [Realtime](/guides/realtime/)). They solve different
halves of the same problem:

|          | Carries              | Delivery guarantee                      | For                                      |
| -------- | --------------------- | ---------------------------------------- | ----------------------------------------- |
| `signal` | a bare channel name    | best-effort, live only                   | "something changed, go refetch"           |
| `sse`    | the event's own payload | replayed from a bounded backlog on reconnect | data that is the update itself, not a pointer to it |

`signal` is deliberately payload-free: the client refetches through a route
that already checks capabilities, so there is one read path, not two. That is
the right answer when there is a record to reread. It is the wrong answer for
a job finishing, an import's progress, or a counter moving -- there is no
capability-checked GET to point the client back at, because the update itself
*is* the information. That is what `sse` is for.

## Publishing: one path, off the existing bus

`SseStreamService.publish` is the only way a channel gets a message, and
nothing calls it except a listener already registered on `EventDispatcher` --
the same extension point every other cross-feature reaction in the kernel
uses. There is no second place a feature could publish from and drift out of
sync with the bus.

```ts
class ExportReady {
  constructor(
    public readonly tenantId: string,
    public readonly exportId: string,
    public readonly downloadUrl: string,
  ) {}
}

class StreamExportReady implements EventListener<ExportReady> {
  readonly name = 'StreamExportReady';

  constructor(private readonly sse: SseStreamService) {}

  async handle(event: ExportReady): Promise<void> {
    await this.sse.publish(event.tenantId, 'exports', 'export.ready', {
      exportId: event.exportId,
      downloadUrl: event.downloadUrl,
    });
  }
}
```

Register `StreamExportReady` with `EventDispatcher.listen(ExportReady, ...)`
the way any other listener is registered, and every dispatch of `ExportReady`
reaches a subscribed browser -- with no code at the dispatch site aware that
streaming is even happening.

## Subscribing

Same two-step flow as `signal`, because the constraint is the same one:
`EventSource` cannot set an `Authorization` header.

```
POST /sse/token                          → { "data": { "token": "…" } }
GET  /sse/stream?token=…&channels=exports
```

`POST /sse/token` is gated the ordinary way -- `SessionGuard`,
`CapabilitiesGuard`, `@Capability(canIssueSseToken)` -- and the token it
returns is bound to the caller's own tenant, never to one the client names.
`GET /sse/stream` carries `@PublicRoute` for the same reason `signal`'s stream
route does: there is no session on this request, only the token already
checked by `SseTokenGuard`.

## Last-Event-ID, and why it is the whole point

Every message this module streams is written with `XADD` to a Redis Stream
keyed by `sse:<tenant>:<channel>`, which gives it a monotonic id of the exact
shape browsers already send back as the `Last-Event-ID` header on
reconnect -- no client code writes that header, `EventSource` always has.

On a fresh connection there is nothing to replay, so `GET /sse/stream` skips
straight to live delivery. On a reconnect, it:

1. Checks whether the backlog still holds `Last-Event-ID` at all
   (`SseStreamService.canReplay`). If it has already rolled off, the client is
   sent a `sse-stale-connection` event -- an explicit "the gap is bigger than
   what this can tell you," not a silent skip.
2. Replays every entry after that id (`XRANGE (lastId +`), in order.
3. Resumes live delivery (`XREAD BLOCK`) from the id of the last replayed
   entry -- not from "now." Resuming from the same id space closes the seam
   between "replayed" and "live": nothing published between the two reads can
   fall through it.

## Retention

The backlog is bounded on purpose, not left to grow forever: `XADD ... MAXLEN
500` (exact, so the bound is never quietly looser than declared) plus a
one-hour `EXPIRE`, refreshed on every publish. A channel nobody publishes to
for an hour is cleaned up; a busy one keeps its most recent 500 messages
regardless of age. Both numbers are per-call defaults on
`SseStreamService.publish`, not global configuration -- a channel that needs a
longer memory can ask for one without changing what every other channel keeps.
