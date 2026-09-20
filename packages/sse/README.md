# @heryjs/sse

Server-Sent Events sourced from the events bus, with Last-Event-ID replay off
a bounded Valkey backlog.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install sse
```

## Why this is not `signal`

The kernel already ships `signal`: an always-present SSE channel that tells a
client "something changed on `blogPost`, go refetch." It carries no payload by
design -- a nudge, never data -- which is exactly right for "reread through the
route that already checks capabilities."

Some updates are not a record to reread through a route: a background job
finishing, a counter moving, a step of a multi-stage import completing. There is
no capability-checked GET to refetch for that -- the update itself *is* the
information. That is what this module is for: a payload-carrying stream, still
sourced from the one events bus every other cross-feature reaction already
uses, with a delivery guarantee `signal` never promised.

## How a feature publishes to it

There is exactly one publish path: dispatch an event on the existing bus, and
let a listener push it onward. No feature calls the transport directly.

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

## Last-Event-ID, honestly

Every published message gets an id from a Redis Stream (`XADD`), which is
exactly the ordered, resumable id space `Last-Event-ID` was designed against.
A reconnecting `EventSource` sends that header back automatically -- browsers
have done this since the format existed -- and the stream route replays every
entry still in the backlog after it before joining the live tail, from the
same id space, so there is no seam between "replayed" and "live."

The backlog is bounded on purpose: `XADD ... MAXLEN 500` (exact, not `~`, so
the bound is never silently looser than declared) plus a one-hour
`EXPIRE` refreshed on every publish. A client that comes back after the
backlog rolled off its last id is told so explicitly (`stale-connection`
event) rather than being handed a silent gap it has no way to detect.

## Auth

`EventSource` cannot set an `Authorization` header, so subscribing is the same
two-step flow as `signal`: `POST /sse/token` while holding a session, then
`GET /sse/stream?token=...`. The capability check happens once, at minting;
the token is bound to the tenant it was minted for and cannot be respelled
from the query string.
