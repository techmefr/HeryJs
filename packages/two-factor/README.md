# @heryjs/two-factor

Time-based one-time passwords for HeryJs: TOTP enrolment, a second-factor check
on the session, hashed single-use recovery codes, and a requirement an admin
can set per role.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install two-factor
```

The issue asked for `@heryjs/2fa`; a module name has to start with a letter to
be a directory, a package name and a CLI word at once, so this is
`two-factor`.

## What it does

- `POST /two-factor/enrolment` mints a secret and an `otpauth://` URL. The
  enrolment does not count until `POST /two-factor/enrolment/confirm` receives
  a first valid code, so a user who never scanned the QR code is never locked
  out of their own account.
- `POST /two-factor/verify` takes a TOTP code or a recovery code and marks the
  current session as having passed its second factor.
- `TwoFactorGuard` goes after `SessionGuard` on any route that must wait for
  that check.
- Recovery codes are shown once, stored hashed (scrypt, salted) and each works
  a single time.
- `PUT /two-factor/requirements/:role` makes two-factor mandatory for a role.

Every route that takes a code is in the `auth` rate-limit bucket, on top of a
per-user lockout after repeated wrong codes.

Licensed MIT, like the framework.
