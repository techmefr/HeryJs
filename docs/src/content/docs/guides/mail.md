---
title: Mail
description: Queued outgoing mail with an audit row per message, behind a driver registry that swaps the transport from a config line.
---

Mail is a module and drivers, like everything else. `MailService` is the only thing you inject, a `Mailable` is the only thing you hand it, and which transport carries the message is a line in `hery.config.ts` — never a line in your resource.

```bash
pnpm hery install mail
pnpm hery migrate --name add_mail_log
```

The install appends a `MailLog` model to `prisma/schema.prisma`, so it leaves you one migration behind. `hery install` never runs Prisma itself.

## A mailable says what to send, never who sends it

```bash
pnpm hery make:mail WelcomeMail
```

That writes a class into `src/functional/<domain>/`, next to the code that uses it — the domain is derived from the name with a trailing `mail` stripped, so `WelcomeMail` lands in `src/functional/welcome/`, and `--domain user` puts it where you meant instead.

```ts
export class WelcomeMail implements Mailable {
  constructor(readonly to: string) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: 'Welcome',
      html: '<p>Write what WelcomeMail says here.</p>',
    };
  }
}
```

`Mailable` is two members: a `to`, and a `build()` returning `{ to, subject, html }`. `build()` may be async, so a mailable that has to load a template from disk or mint a signed link can do it without its caller knowing which ones need to. **A mailable never picks a driver, reads config, or touches a vendor SDK** — that is the registry's job, and keeping it out is exactly what lets the same `WelcomeMail` keep working the day the transport changes underneath it.

Sending is one call, and it names nothing about transport:

```ts
await this.mail.send(new WelcomeMail(user.email));
```

## Every send is queued, and every send leaves a row

`MailService.send()` does not send. It builds the message, writes a `MailLog` row with `status: 'queued'` and the current tenant, then dispatches a `mail.send` job. The row is written **before** the job is dispatched, so a message can never be handled by a worker that has nothing to record its outcome against.

`MailProcessor` picks the job up off the default queue, asks the registry for the active driver, and flips the row to `sent` with a timestamp or to `failed` with the error message. The processor reads the driver per job rather than caching it in a field: the worker is long-lived, and resolving on use keeps it honest if the active driver is swapped under it.

The `MailLog` row is the point. A queued mail that never arrived is otherwise invisible — the row makes "did we send it, and what happened" a query rather than a log-grep. `GET /mail?page=&limit=` returns the log for the current tenant, newest first, behind `SessionGuard`, `CapabilitiesGuard` and its own `canReadMailLog`. That policy is **admin-only, with no `own` fallback**: the log carries every recipient address the tenant ever wrote to, which is the tenant's whole correspondence rather than the caller's.

## The default driver logs, and that is what makes a fresh app safe

`LogMailDriver` implements the whole contract honestly and writes `to=… subject="…"` to the Nest logger. Nothing leaves the process. A freshly generated app therefore **cannot accidentally email a live person**, because the driver it got by default has no way to.

It ships inside the module rather than as a package, and the registry holds it by constructor injection instead of resolving it by token, because it is the one driver guaranteed to be present.

## One config line swings the app from logging to sending

```ts
mail: {
  default: process.env.MAIL_DRIVER ?? 'log',
  drivers: {
    log: { driver: 'log' },
    resend: { driver: 'resend' },
  },
},
```

`drivers` declares what exists; `default` names which one is active. Mail is a single-active-driver module — a resource says "send this", never "send this over Resend" — so `MailDriverRegistry` exposes only `active`, and no call site can override it.

**`MAIL_DRIVER` is a real environment variable now, and it selects a name rather than carrying a secret.** That is the one legitimate use of `process.env` inside `hery.config.ts`: `MAIL_DRIVER=log` in development, `MAIL_DRIVER=resend` in production, and no diff between the two. Credentials never appear here; they belong to the driver, through `parseModuleEnv`.

Leave the `mail` slice out entirely and the registry falls back to a single `log` driver, which is what a project that has not thought about mail yet should get.

## A declared driver that is not installed stops the boot

Resolution runs in `onModuleInit`, and every declared driver is resolved — not only the active one. A project that declares Resend but runs on `log` locally finds out the Resend package is missing on its own machine, rather than the first time production starts with `MAIL_DRIVER=resend`.

```
hery.config.ts declares mail driver "resend" with driver "resend", but no module
is installed to provide it. Run "pnpm hery install mail-resend" or remove
"resend" from hery.config.ts.
```

A `default` naming a driver that is not in `drivers` fails the same way, at the same moment, listing what is declared. **Neither case ever falls back to `log`**: an app that silently logs mail instead of sending it looks healthy until a user reports an email that never arrived, which is strictly worse than an app that refuses to start.

## Resend is one package away

```bash
pnpm hery install mail-resend
```

It lands in `src/modules/mail` rather than a folder of its own. That destination is load-bearing: `.dependency-cruiser.cjs` forbids one module importing another, so a driver living in `src/modules/mail-resend` could never reach the `MailDriver` contract — and landing beside the module it extends also means uninstalling `mail` takes its drivers with it.

Import `ResendMailModule` into `src/app.module.ts`, declare `resend: { driver: 'resend' }`, and set `RESEND_API_KEY` and `RESEND_FROM`. Those two are parsed lazily, the first time the driver actually sends, so an app that declares Resend but runs on `log` is **never refused a boot over credentials it will never use**.

The driver is one `POST` over `fetch`, with no SDK dependency — a package that added nothing but a typed wrapper around a single request would still have to be installed, audited and upgraded by everyone who only wanted to send mail. A non-2xx from Resend throws rather than logging, because the throw is what flips the `MailLog` row to `failed` and lets BullMQ see the job as failed.

## Templates are a second, smaller path — and they do not escape

`MailService.queue(to, template, data)` skips the mailable and renders a named template instead:

```ts
await this.mail.queue(user.email, 'welcome', { name: user.name, app: 'Acme' });
```

Templates are a `Record` in `mail.templates.ts` and interpolation is `{{key}}` substitution. No engine, no template files to locate at runtime, one shipped example (`welcome`) to copy. An unknown template name throws rather than sending a blank message, and a missing key becomes an empty string rather than an error. **Values are not HTML-escaped** — pass user-supplied content through your own escaping before it reaches `data`.

Prefer `make:mail` for anything a person will read. A mailable is a typed class your compiler checks; a template name is a string nothing checks.

## Retries are not configured

The job is dispatched with no options, so BullMQ's defaults apply: **one attempt, no retry, no backoff**. A failed send marks the row `failed` and the job stays in the failed set. If mail matters, set `attempts` and `backoff` on the dispatch before you go live.

The BullMQ dashboard is mounted at `/jobs` when `NODE_ENV` is not `production`. It is mounted at the Express level, so no Nest guard applies and **it is unauthenticated**, and it shows the whole queue across every tenant. A local development tool, not an admin surface.

## Auth's two emails go through the same service

The kernel's password-reset and email-verification flows need to send mail, and the kernel may not import an uninstallable module. So auth declares an `AUTH_MAILER` contract and looks its implementation up by token; the mail module binds it. Installing `mail` is what turns those two messages from logged warnings into real emails.

With nothing bound, the email is dropped and the reason is logged once per attempt rather than thrown — a password-reset request must not 500 because the app chose not to install mail:

```
Wanted to email someone@example.com but no mail module is installed to send it.
Run "pnpm hery install mail" to have auth emails delivered.
```

Both messages are ordinary mailables (`ResetPasswordMailable`, `VerifyEmailMailable`), so they are testable without a mail driver at all, and the reset link is taken from Better Auth rather than rebuilt from an app URL — only the URL Better Auth hands over is guaranteed to carry the token in the shape its own verification route expects.

## What mail deliberately does not do

- **No SMTP driver ships.** Choosing between SMTP and a vendor API has cost, deliverability and compliance consequences, and the framework has no opinion worth imposing. The convention is what is shipped; writing an `SmtpMailDriver` against `MailDriver` is a contract and a token away.
- **`MailMessage` is `to`, `subject`, `html` and nothing else.** No cc, no bcc, no attachments, no plain-text alternative. Every one of those is a real feature, and none of them is in the contract today — adding one means widening the contract for every driver at once, which is the deliberate friction.
- **No per-call driver selection.** Unlike [export](/guides/export/), mail has no `as()`. Nothing in a resource should get to decide that _this_ particular message goes over a different transport.
- **No retry policy, no bounce handling, no suppression list.** The `MailLog` row records what happened; acting on it is yours.
