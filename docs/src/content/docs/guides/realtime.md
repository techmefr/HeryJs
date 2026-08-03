---
title: Realtime
description: Three different problems — signal for "something changed", live for two-way messaging, stream for audio and video.
---

Realtime is not one feature. Telling a browser that a list is stale, letting two clients exchange messages, and moving video between participants are three problems with three answers, and conflating them produces a WebSocket layer that does all three badly.

| | Transport | In the box? | For |
|---|---|---|---|
| `signal` | Server-Sent Events over Redis pub/sub | kernel, always present | "something changed, refetch" |
| `live` | Socket.IO | `hery install live` | two-way messaging on a record |
| `stream` | LiveKit (SFU) | `hery install stream` | one-to-many audio/video |

## `signal` — the invalidation channel

Every generated collection route already tells the client which channel to watch:

```json
{
  "data": [ … ],
  "meta": { "channels": ["workout"] },
  "messages": []
}
```

The generated service publishes on that channel after every mutation. A subscriber gets a nudge, not the record:

```json
{ "channel": "workout", "at": 1730000000000 }
```

That is the whole payload, and it is deliberate. If the event carried the data, the event would need its own permission check, its own view stripping and its own tenant scoping — a second, parallel read path with the same rules to keep in sync as the first. Instead the client hears "workouts changed" and refetches through the ordinary route, which already resolves capabilities, applies the scope filter and strips hidden fields. One read path, one set of rules.

### Subscribing

An `EventSource` cannot set an `Authorization` header, so the flow is two steps: exchange the session for a short-lived signal token, then open the stream.

```
POST /signal/token                        → { "data": { "token": "…" } }
GET  /signal/stream?token=…&channels=workout
```

The security property is in how the channel name is assembled. The client sends a bare channel (`workout`); the server prefixes it with the tenant taken **from the token**, not from the query string:

```ts
.map((channel) => `${CHANNEL_PREFIX}${payload.tenantId}:${channel}`)
```

So `channels=workout` subscribes to `signal:<your-tenant>:workout` and there is no way to spell another tenant's channel — the tenant segment is not yours to write. A missing or invalid token is a 401; no channels at all is a 400.

Because it is Redis pub/sub, this works across processes: an instance that handles a write reaches subscribers connected to every other instance.

## `live` — bidirectional messaging

```bash
pnpm hery install live
pnpm hery generate Workout --live
```

The generator writes a gateway per resource, on its own Socket.IO namespace:

```ts
@WebSocketGateway({ namespace: '/live/workout' })
```

Clients connect with the same bearer token they use for REST, in the handshake:

```js
io('/live/workout', { auth: { token } });
```

Three inbound events — `join`, `leave` and `message`, all keyed by record id — and one outbound `message`.

### Both boundaries are re-established on the socket

This is the part worth reading closely, because a WebSocket bypasses everything the HTTP pipeline does for you. `TenantMiddleware` wraps the *handshake*, not each subsequent frame on an already-open connection, so a message handler runs with no ambient tenant unless one is put back. The module does that explicitly, from the connection-time user rather than anything the client sends:

```ts
export function withTenant<T>(client: LiveSocket, fn: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run(
    {
      tenantId: client.data.user.tenantId,
      userId: client.data.user.id,
      impersonatedBy: client.data.user.impersonatedBy,
    },
    fn,
  );
}
```

Capabilities are re-checked per event, not once at connection: `join` resolves `canViewWorkout` against the loaded record, `message` resolves `canUpdateWorkout`. A denied event answers with `{ error: 'capability denied' }` in the acknowledgement rather than throwing.

Authentication happens twice on purpose — `handleConnection` disconnects an unauthenticated socket outright, and a guard on the gateway class covers each event after that.

### Two limits to know

The default in-process Socket.IO adapter is used, with no Redis adapter, so **rooms do not span processes**: two clients on different instances are not in the same room. Behind more than one instance you will need to add an adapter.

Also note the generated gateway has no server-side emitter — it relays messages between clients. Broadcasting *your own* changes to a browser is the `signal` path above, not this one.

## `stream` — one-to-many audio and video

```bash
pnpm hery install stream
docker compose -f docker-compose.stream.yml up -d
pnpm hery generate Workout --stream
```

LiveKit does the media work; HeryJs only decides who may get a token. Two routes per resource, one room per record:

| Route | Capability | Token grants |
|---|---|---|
| `POST /workouts/:id/stream/publish-token` | `canUpdateWorkout` | publish, no subscribe |
| `POST /workouts/:id/stream/viewer-token` | `canViewWorkout` | subscribe, no publish |

Both return `ok({ room, token })`.

The gate is on **issuing** the token, and it is the ordinary `CapabilitiesGuard`: the record is loaded through the resource's tenant-scoped loader, the policy function runs against it, and only then is a token minted. Whoever may edit the record may broadcast into its room; whoever may read it may watch. There is no separate permission vocabulary to learn, and no rule duplicated between HTTP and media.

Scope is deliberately narrow: one publisher per room, any number of subscribe-only viewers. The service does room creation, room deletion and token minting — there is no recording, no egress and no participant administration.

Room names are derived from the record (`workout:<id>`) and are not tenant-prefixed; isolation comes from the record loader being tenant-scoped, so a caller cannot reach a record — and therefore cannot obtain a token — outside its own tenant.

The compose file runs LiveKit in dev mode with the well-known `devkey` / `secret` credentials. `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` all have development defaults matching it, which means a deployment that forgets to set them is running on published credentials. Set all three.
