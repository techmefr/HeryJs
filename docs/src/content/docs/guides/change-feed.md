---
title: Realtime change feed
description: Row changes published to browsers over SSE or Socket.IO, tenant-isolated and filtered per subscriber by capability, with presence and capability-gated broadcast.
---

[`signal`](../realtime/) says "blog posts changed, go refetch". [`sse`](../sse/) streams whatever a listener publishes. Neither does what Supabase Realtime's `postgres_changes` and Laravel Echo's model broadcasting do: *a row changed, tell the people who may see it, with the row.*

The change feed is that, built on the [transactional outbox](../outbox/). A write commits its `model.*` message in the same transaction, so a rolled-back write never reaches a subscriber and a committed one is never lost.

## One hub, two transports

```
write ──tx──▶ OutboxMessage ──relay──▶ ChangeFeedPublisher ──▶ Redis topic per tenant
                                                                      │
                                         ┌────────────────────────────┴───────┐
                                         ▼                                    ▼
                                  GET /sse/changes                  Socket.IO /changes
                                  (`sse` module)                     (`live` module)
                                         └──────────── ChangeFeedHub ─────────┘
                                                per-subscriber capability filter
```

`ChangeFeedModule` is in the kernel and imported by `AppModule`. The transports are the optional modules you already install: `hery install sse` adds the HTTP stream, `hery install live` adds the socket namespace. Both are thin; the filtering lives once, in `ChangeFeedHub`.

## A channel per resource

A generated resource registers itself, in `<name>.change-feed.ts`:

```ts
this.feed.register({
  model: 'BlogPost',
  channel: BLOG_POST_SIGNAL_CHANNEL,
  canViewAny: canViewAnyBlogPost,
  canView: canViewBlogPost,
  canBroadcast: canUpdateAnyBlogPost,
  load: (id) => this.loader.load(id),
  toView: toBlogPostView,
});
```

The channel is the one `meta.channels` already advertises (`blogPost`), so a client that watches a list for `signal` can switch to the feed without learning a second name. Hand-written resources call `ChangeFeedRegistry.register` the same way.

## Who receives what

Every rule below is enforced on the server, per subscriber, at delivery.

| Guarantee | How |
| --- | --- |
| **Tenant isolation** | The tenant comes from the authenticated session or the signed token, never from anything the client sends. The cross-process topic is `change-feed:<tenantId>`, and a message whose tenant is not the subscriber's is dropped even if a backend misrouted it. |
| **Subscribe auth** | A channel is granted only if `canViewAny` allows the caller. A refused channel is reported as `forbidden` (or `unknown-channel`), never silently skipped. |
| **Per-subscriber capability filtering** | Each change carries the row's `ownerId` and `teamId`. The hub runs the resource's own `canView` for *this* subscriber against them, so an `own` subscriber gets its rows, a `team` subscriber its team's, an `all` subscriber everything, and the decision is the same function the detail route uses. |
| **No hidden or encrypted fields** | The payload is the resource's `toView` output, produced once in the relay, so a field the view strips never leaves that process, never touches Redis, and is never on a socket. `changedFields` is cut to the keys the view exposes, so a hidden field's *name* does not leak either. |
| **Deletions** | A deletion carries no row, only `recordId` and `record: null`, and goes to exactly the subscribers who could have read the row. |

## Over SSE

```
POST /sse/changes/token                      → { "data": { "token": "…" } }
GET  /sse/changes?token=…&channels=blogPost
```

The token is minted from a session (`SessionGuard`, `canIssueSseToken`), lives 60 seconds, and carries the caller's identity and capability subject, because filtering needs *who* is listening and not only which tenant. It is signed with a domain-separated HMAC, so an `sse` or `signal` token cannot open this stream.

Events on the stream:

| Event | Data |
| --- | --- |
| `subscribed` | `{ channels, denied }` — what was granted and what was refused |
| `change` | `{ type, id, channel, kind, recordId, at, changedFields, record }`, with the outbox message id as the SSE `id` |
| `presence` | another subscriber joined or left, if it is on the socket transport |
| `broadcast` | a client message relayed from the socket transport |
| `resync` | sent after a reconnect (`Last-Event-ID` present): refetch through the ordinary route |

If every requested channel is refused the answer is a `403` with the denials in `details`, not an empty stream.

**There is no per-subscriber replay.** The outbox is at-least-once and unordered across messages, and replaying a backlog would mean re-filtering it for the reconnecting caller. A reconnect is told to `resync` instead, which is the same refetch `signal` has always meant. Clients dedupe on `id`: delivery is at-least-once.

## Over Socket.IO

```js
const socket = io('/changes', { auth: { token } });

socket.emit('subscribe', { channels: ['blogPost'] }, (result) => {
  // { subscribed: ['blogPost'], denied: [] }
});
socket.on('change', (message) => { /* same shape as the SSE event */ });
```

Authentication is the same bearer token as REST, checked at connection and again by the gateway guard, and the subject is rebuilt from the session, never from the client.

| Client event | Body | Answer |
| --- | --- | --- |
| `subscribe` / `unsubscribe` | `{ channels }` | `{ subscribed, denied }` / `{ unsubscribed }` |
| `presence:join` | `{ channel, state }` | `{ ok: true, members }` or `{ ok: false, error }` |
| `presence:leave` | `{ channel }` | `{ ok: true }` |
| `broadcast` | `{ channel, event, payload }` | `{ ok: true }` or `{ ok: false, error }` |

### Presence

Join a channel you are subscribed to and everyone else subscribed to it hears `presence` `joined` / `left`, with your user id and a small `state` you chose (cursor, "typing", up to 1 KB). Members live in a Redis hash with a heartbeat, so they span instances, and a process that crashes loses its members after 90 seconds instead of leaving ghosts. A disconnect leaves every channel you had joined.

### Broadcast

A subscribed client may send an event to the other subscribers of the channel, Supabase-style. It is gated by the resource's `canBroadcast`, which the generator sets to the collection-level update capability: whoever may edit the resource may broadcast on it. The event name is validated, the payload is capped at 4 KB, the sender does not get its own message back, and it never leaves the tenant. Broadcast carries only what the client wrote, never row data.

## What it deliberately does not do

- **No row values in the outbox.** The relay reads the row when it delivers, so a change is the row *now*, not at write time. An update delivered after a later delete arrives as a deletion.
- **A subscriber's capability is fixed at connect.** The subject is read when the token is minted or the socket authenticates, so a role change takes effect on reconnect. Tokens live 60 seconds; sockets live as long as the connection.
- **A row that moves out of a subscriber's scope** (its `ownerId` changes) is not announced to the old owner as a deletion.
- **No ordering across messages**, inherited from the outbox. Use `at` and `id`.
- **No bulk writes.** `createMany`, `updateMany` and `deleteMany` are not announced by the outbox, so neither are they here.
