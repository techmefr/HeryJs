---
title: Peer-to-peer signalling
description: WebRTC offer/answer/ICE exchange and TURN credentials over the live gateway -- rooms, presence, and what to do when ICE fails. No media server.
---

```bash
pnpm hery install live
pnpm hery install peer
```

`peer` requires `live`. It does not open a second WebSocket server: it adds
events to the same "/peer" Socket.IO gateway and reuses `LiveAuthGuard` and
`withTenant`, the same way every generated live gateway does. A second
gateway would mean a second auth path, and that is exactly where a tenant
boundary gets lost.

```js
const socket = io('/peer', { auth: { token } });
socket.emit('join-room', { room: 'call-42' }, (ack) => {
  // ack.participants: [{ socketId, userId }, ...]
});
```

## What this module is

Signalling and credentials, and nothing past that:

- **Offer, answer and ICE candidates**, relayed between two clients scoped to
  a room. The payload is opaque to the server -- it is SDP and ICE data the
  two browsers negotiate between themselves.
- **Rooms with a capability in front of them.** `join-room` resolves
  `canJoinPeerRoom`, and the participant list handed back (on join, or from
  `participants`) is only included when `canViewPeerRoomParticipants` allows
  it. Both ship as a permissive `everyone('all')` default, written the same
  way as the kernel's other non-resource capabilities
  (`canManagePrune`, `canIssueSignalToken`) -- see
  [Capabilities](../capabilities/). An application with real room membership
  rules (a Room record with an owner, an invite list) replaces the two
  exported `PolicyCheck`s in `peer.policy.ts` with its own; the gateway only
  ever calls them by name.
- **TURN credentials**, minted per participant with a short TTL.
- **Presence**, including a peer that disconnected without saying goodbye.

## Explicitly out of scope

**No media server, no SFU, no recording.** This module never sees a media
frame -- it moves signalling messages between two browsers that then talk to
each other directly, or through a TURN relay they authenticate to on their
own. Group calls beyond what two peers can mesh, recording a call, or mixing
streams server-side are a different kind of module entirely (closer to
`stream`, which fronts a real SFU) and are not what installing `peer` gives
you.

## TURN credentials

TURN servers (coturn, in practice) support a
[`use-auth-secret`](https://github.com/coturn/coturn/blob/master/README.turnserver)
mode: the application server and the TURN daemon share one secret that never
reaches a client, and a credential is:

```
username   = "<expiry-unix-seconds>:<label>"
credential = base64(HMAC-SHA1(secret, username))
```

`PeerTurnCredentialsService.mint(label, ttlSeconds)` produces exactly that.
The client asks for one over the socket:

```js
socket.emit('turn-credentials', (credentials) => {
  // { username, credential, ttlSeconds, uris }
});
```

A client can present what was minted for it and nothing else -- it never
holds the secret, so it cannot mint a credential for a longer TTL or a
different label than the server issued. Set `PEER_TURN_SECRET` to the same
value your coturn instance was started with, and `PEER_TURN_URIS` to your
actual TURN endpoints, before deploying; both ship with a development
default that is refused once `NODE_ENV=production`.

## Presence and disconnection

Room membership is tracked in process memory, keyed by socket id rather than
user id -- the same user open in two tabs is two participants, each free to
leave independently. `join-room` and `leave-room` update it and broadcast
`peer-joined`/`peer-left` to the room. A socket that disconnects without
sending `leave-room` -- the network dropped, the tab closed -- is still
removed from every room it was in, and the same `peer-left` event is
broadcast with `reason: 'disconnected'`, so the client side does not need to
special-case a vanished peer differently from one that left on purpose.

Like the live module's own rooms, this is the in-process Socket.IO adapter
with no Redis adapter: presence does not span multiple instances. Add one
before running more than one process.

## When ICE fails

Signalling can complete and the peer connection can still fail to establish
-- both browsers are behind restrictive NATs and the TURN relay itself is
unreachable, misconfigured, or overloaded. This module's documented fallback
is: **surface a "call failed" state to the application and stop.** It does
not attempt a data-channel-over-Socket.IO fallback or any other transport
substitute for the media path ICE was negotiating -- that would be a second
transport to secure and maintain for a failure mode real TURN infrastructure
is supposed to make rare. An application that needs a harder guarantee of
connectivity should treat that as a reason to look at `stream` (a real SFU)
for that call, not a reason to ask `peer` to grow one.
