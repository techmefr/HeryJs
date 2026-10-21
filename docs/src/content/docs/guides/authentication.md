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

## Passwordless sign-in

Five methods sit beside the password, each **off** until its flag is `true`. They are off by default because Better Auth is mounted wholesale under `/api/auth`: registering a plugin adds its routes to the public surface. `passwordless-routes.spec.ts` lists exactly what each one adds, so turning a flag on is a reviewed diff.

| Flag                     | What it adds                                  | Delivered through       |
| ------------------------ | --------------------------------------------- | ----------------------- |
| `AUTH_MAGIC_LINK_ENABLED` | `POST /api/auth/sign-in/magic-link`          | the mail module         |
| `AUTH_EMAIL_OTP_ENABLED`  | `POST /api/auth/email-otp/send-verification-otp`, `POST /api/auth/sign-in/email-otp` | the mail module |
| `AUTH_PHONE_OTP_ENABLED`  | `POST /api/auth/phone-number/send-otp`, `POST /api/auth/phone-number/verify` | the sms module |
| `AUTH_ANONYMOUS_ENABLED`  | `POST /api/auth/sign-in/anonymous`            | nothing to deliver      |
| `AUTH_PASSKEY_ENABLED`    | `/api/auth/passkey/*`: register, list, rename, delete and sign in with a WebAuthn passkey | nothing to deliver |

Delivery follows the same rule as the password-reset email: the kernel never imports `mail` or `sms`. It finds them by token (`AUTH_MAILER`, `AUTH_SMS_SENDER`), and with the module not installed the message is dropped with a logged warning telling you which `hery install` to run, instead of failing the request.

```bash
curl -X POST https://your-app/api/auth/email-otp/send-verification-otp \
  -H "Content-Type: application/json" -d '{"email":"a@b.test","type":"sign-in"}'

curl -X POST https://your-app/api/auth/sign-in/email-otp \
  -H "Content-Type: application/json" -d '{"email":"a@b.test","otp":"123456"}'
```

The response carries the session token (`token`, and `set-auth-token` in the headers) used as the bearer token everywhere else.

Settings, all optional:

- `AUTH_PASSWORDLESS_ALLOW_SIGN_UP` (default `true`): when `false`, a link or code only signs in an existing account.
- `AUTH_MAGIC_LINK_EXPIRES_SECONDS`, `AUTH_OTP_EXPIRES_SECONDS` (default 300), `AUTH_OTP_LENGTH` (default 6).
- `AUTH_OTP_MAX_ATTEMPTS` (default 3): wrong guesses a code survives. The fourth try fails even with the right code, so six digits cannot be brute-forced inside the window. Codes and link tokens are stored hashed.
- `AUTH_ANONYMOUS_EMAIL_DOMAIN`: the domain of the placeholder email a guest gets.

Phone numbers must be E.164 (`+33612345678`); anything else is a 400 before a message is sent. A phone-only account gets a placeholder email on `phone.heryjs.local`.

### Passkeys

`AUTH_PASSKEY_ENABLED=true` also needs `AUTH_PASSKEY_RP_ID` (the domain the credential is bound to, e.g. `example.com`) and `AUTH_PASSKEY_ORIGIN` (the origin of the page that calls `navigator.credentials`, comma-separated for several); the app refuses to boot without them. `AUTH_PASSKEY_RP_NAME` is the label the browser shows (default `HeryJs`). Registration needs a session; `GET /api/auth/passkey/generate-authenticate-options` and `POST /api/auth/passkey/verify-authentication` run before one. A passkey belongs to a user, so signing in with it lands in that user's tenant like every other method.

The WebAuthn ceremony itself happens in the browser; the specs here cover the server side (options, ownership, routes) and do not drive an authenticator.

### Rate limits

The whole mount is on the `auth` bucket, which counts one caller by IP. A link or a code goes to somebody else, so a second bucket, `auth-recipient` (3 per 600 seconds by default, retunable in `hery.config.ts` like the others), counts per tenant and per recipient on every route that sends one, however many addresses the requests come from. It fails closed with a 503 when the counter store is down.

### Tenants

A user created by any of these methods lands in the same tenant a password sign-up does, and the caller is still resolved from the database on every request. Nothing about the tenant comes from the client.

### Guests

`sign-in/anonymous` creates a real user and session. When the guest later signs in with a link, a code or a password, the rows the guest owns (blog posts, notifications, push tokens, team memberships) move to the account, and the guest user is deleted. This happens only inside one tenant: a guest that signs in to an account of another tenant has its rows dropped with it rather than carried across the boundary.

## API keys

A session token is the wrong fit for CI, cron, or any script that runs unattended — nobody is there to log in again when it expires. API keys exist for exactly that case: a bearer token scoped to the same user who created it, with no expiry, revocable at will.

```
POST   /api-keys                   { name }   // create — the only time the raw key is shown
GET    /api-keys?page=&limit=                 // list — id, name, timestamps, never the key itself
DELETE /api-keys/:id                          // revoke
```

All three routes sit behind `SessionGuard` and `CapabilitiesGuard` like everything else: minting a key requires being logged in first. Each key acts as the user who created it — same tenant, same role, same capabilities, same everything a session token for that user would resolve to. There is no separate permission model for keys; if you would not trust the user with a capability, do not create a key for them.

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
- **Mint, list or revoke keys.** All three routes above refuse a request authenticated by a key rather than a session, with a 403 `apiKey.forbidden`. Otherwise revoking a leaked key would not actually cut off access: the bearer could have minted further keys with it, each with its own prefix and its own `revokedAt`, so revoking the one you know about leaves the others live.

## Managing sessions

A signed-in person can see where they are signed in and end any of it. Every route takes the session token in `Authorization: Bearer`, and acts on the caller's own sessions only.

```
GET    /auth/sessions?page=&limit=   // live sessions: id, ipAddress, userAgent, createdAt, expiresAt, isCurrent
DELETE /auth/sessions/:id            // sign one device out
DELETE /auth/sessions/others         // sign out everything but this session
DELETE /auth/sessions                // sign out everywhere, this session included
POST   /auth/password/change         { currentPassword, newPassword }
```

The list never contains a token, only the id that the revoke routes take, and `isCurrent` marks the session that made the request. Another user's session id answers 404, the same as one that does not exist.

`POST /auth/password/change` checks the current password (400 `auth.currentPasswordInvalid` when it is wrong), signs every other session out and returns a fresh `token` for the caller, because the one that was sent is revoked with the rest. A password reset through `/api/auth/reset-password` revokes every session as well, and Better Auth's own `/api/auth/change-password` is forced to revoke the other sessions even when the client does not ask, so no route changes a password and leaves an old session alive.

An API key is refused on all five routes with a 403 `apiKey.sessionsForbidden`, for the same reason it cannot manage keys: a leaked key must not be able to sign its owner out or change their password.

## Lockout after repeated failures

The `auth` rate-limit bucket counts per IP. Lockout counts per account: after `AUTH_LOCKOUT_MAX_ATTEMPTS` consecutive wrong passwords (default 5) the email is refused for `AUTH_LOCKOUT_SECONDS` (default 900), even for the right password. The answer is a 429 `auth.accountLocked` from `/auth/login`, and a 429 with a `Retry-After` header from Better Auth's own `/api/auth/sign-in/email`, which is guarded by the same counter. A successful sign-in resets it.

Addresses that are not registered are counted like registered ones, so the lockout cannot be used to find out which emails have an account. Redis keys hold a hash of the address, never the address itself, and the case of the email does not matter. Two-factor codes are not counted here.
