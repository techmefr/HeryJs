---
title: Authentication
description: Session tokens for people, API keys for scripts — both resolve to the same bearer-token contract every guard checks.
---

Every protected route sits behind `SessionGuard`, which reads one thing: an `Authorization: Bearer <token>` header. What the token actually is — a session or an API key — is resolved by its shape, not by a separate guard or a separate header. Either way, the guard attaches the same `AuthenticatedUser` to the request: id, tenant, team memberships, role, capabilities all resolve from that one object, regardless of which credential produced it.

## Session tokens

```
POST /auth/register   { email, password }
POST /auth/login      { email, password }
```

Both return a bearer token backed by Better Auth. It expires the way any login session does, and it is the right credential for anything driven by a human: a browser tab, a mobile app, an admin panel.

## API keys

A session token is the wrong fit for CI, cron, or any script that runs unattended — nobody is there to log in again when it expires. API keys exist for exactly that case: a bearer token scoped to the same user who created it, with no expiry, revocable at will.

```
POST   /api-keys        { name }   // create — the only time the raw key is shown
GET    /api-keys                   // list — id, name, timestamps, never the key itself
DELETE /api-keys/:id               // revoke
```

All three routes sit behind `SessionGuard` like everything else: minting a key requires being logged in first. Each key acts as the user who created it — same tenant, same role, same capabilities, same everything a session token for that user would resolve to. There is no separate permission model for keys; if you would not trust the user with a capability, do not create a key for them.

```ts
const created = await request(app.getHttpServer())
  .post('/api-keys')
  .set('Authorization', `Bearer ${sessionToken}`)
  .send({ name: 'ci-script' });

const { key } = created.body.data; // hery_ak_<prefix>.<secret> — shown once
```

From then on, that key is used exactly like a session token:

```bash
curl -X POST -H "Authorization: Bearer hery_ak_…" -H "Content-Type: application/json" \
  -d '{}' https://your-app/blog-posts/search
```

### How a key is stored and checked

The raw key is never stored. At creation, HeryJs generates a random secret, splits off a short public prefix for lookup, and stores only the SHA-256 hash of the full key plus that prefix — the same shape GitHub and Stripe use for their own tokens. `SessionGuard` tells a key from a session by its `hery_ak_` prefix alone; a key validates by looking up its prefix, then comparing hashes in constant time (`timingSafeEqual`), so a mistyped or partially-leaked key cannot be brute-forced through timing.

Revoking a key sets `revokedAt` rather than deleting the row — every request made with it up to that point is still attributable in whatever logs already recorded it.

### What a key cannot do

- **See its own secret again.** `GET /api-keys` returns metadata only. If it is lost, revoke it and mint a new one.
- **Outlive its owner's access.** A key has no independent lifetime beyond the user it belongs to; there is nothing to configure per key beyond a name.
- **Act as anyone but its creator.** There is no "service account" concept separate from a real user — if a script needs its own identity rather than borrowing a person's, create a dedicated user for it and mint the key from that account.
