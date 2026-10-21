---
title: Two-factor authentication
description: TOTP enrolment, a second-factor check on the session, hashed single-use recovery codes, and a requirement an admin can set for a role.
---

```bash
pnpm hery install two-factor
```

The package is `@heryjs/two-factor` rather than `@heryjs/2fa`: a module name is a directory, an npm id and a word on the command line all at once, and it has to start with a letter.

The Better Auth `twoFactor` plugin the kernel already mounts under `/api/auth` is untouched and independent. This module is the HeryJs-side one, with its own tables, so it can be tenant-scoped, audited and tied to a role.

## The flow

```ts
GET    /two-factor                      // status of the caller's own factor
POST   /two-factor/enrolment            // mint a secret and an otpauth:// URL
POST   /two-factor/enrolment/confirm    // first code: this is what completes enrolment
POST   /two-factor/verify               // { code } or { recoveryCode }, after login
POST   /two-factor/recovery-codes       // { code }: replace every recovery code
POST   /two-factor/disable              // { code }

GET    /two-factor/requirements         // admin: roles that must use it
PUT    /two-factor/requirements/:role   // admin: require it for a role
DELETE /two-factor/requirements/:role   // admin: stop requiring it
```

**Enrolment is only complete once a first code has been verified.** `POST /two-factor/enrolment` stores a secret but nothing treats the user as enrolled until `POST /two-factor/enrolment/confirm` receives a code from it. Without that, a user who never managed to scan the QR code would be locked out of their own account by a factor they cannot produce. Starting again before confirming replaces the pending secret.

The confirmation response carries the recovery codes. It is the only time they are ever shown.

## Verification at login

Login stays what it is: `POST /auth/login` returns a session token. The second factor is a separate step on that session, because the kernel's login is not something a module should rewrite:

1. The user logs in and gets a token.
2. They call `POST /two-factor/verify` with that token and a code.
3. The session is recorded as verified, for `TWO_FACTOR_SESSION_SECONDS` (12 hours by default). Only a hash of the token is stored.

`TwoFactorGuard` enforces it. Put it after `SessionGuard` on every route that has to wait:

```ts
@UseGuards(SessionGuard, TwoFactorGuard, CapabilitiesGuard)
```

For a user who is enrolled it answers `403 two-factor.required` until the session has verified. For a user whose role requires two-factor and who has not enrolled it answers `403 two-factor.enrolment-required`. For anyone else it lets the request through. The routes under `/two-factor` do not use it, so an unverified user can always reach them.

The guard deliberately skips two kinds of caller: an **API key**, which is a separate non-interactive credential, and an **impersonation session**, whose whole point is acting as someone who is not at the keyboard. Neither is a way around a role requirement for a human session.

## Recovery codes

Ten codes, shown once, each usable a single time. They are hashed like a password (scrypt, a random salt per code) and compared in constant time: the database never holds a code that could be read back. A recovery code works at `POST /two-factor/verify` in place of a TOTP code, typed with or without its dashes. `POST /two-factor/recovery-codes` replaces all of them, behind a valid TOTP code.

The TOTP secret itself has to be recoverable to compute codes, so it is encrypted at rest with AES-256-GCM under `TWO_FACTOR_ENCRYPTION_KEY` (64 hex characters). That variable has a development default and is refused in production while it is still the default.

## Requiring it for a role

`PUT /two-factor/requirements/admin` makes two-factor mandatory for every `admin` in the caller's tenant. From then on `TwoFactorGuard` refuses an admin who has not enrolled, and a user in that role cannot turn their own factor off (`409 two-factor.required-by-role`). Managing requirements takes the `admin` role.

## What stands between a code and a brute force

- Every route that takes a code (`confirm`, `verify`, `recovery-codes`, `disable`) is in the **`auth` rate-limit bucket**, keyed per user, not the read bucket.
- Each attempt is counted before the code is looked at, so a parallel burst cannot buy more guesses than the budget. After `TWO_FACTOR_MAX_FAILURES` (5) wrong codes the factor locks for `TWO_FACTOR_LOCK_SECONDS` (15 minutes) and refuses even a correct code, with `429 two-factor.locked`.
- A TOTP code is accepted once. The last accepted step is stored and claimed atomically, so a code observed over a shoulder, or replayed in parallel, works for no second session. An older code inside the drift window is refused once a newer one has been used.
- `TWO_FACTOR_DRIFT_WINDOW` is how many 30-second steps either side of now are tolerated (1 by default).
- A recovery code is claimed with a conditional update, so two parallel requests cannot both spend it.

## Installing

The module adds four tenant-scoped tables and patches `prisma.client.ts` to register them with the tenant boundary, so a fresh install needs a migration:

```bash
pnpm hery migrate --name add_two_factor
```

Then import `TwoFactorModule` into `src/app.module.ts`, set `TWO_FACTOR_ENCRYPTION_KEY`, and add `TwoFactorGuard` to the routes that must wait for the second factor.
