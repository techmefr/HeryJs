---
title: Logging
description: Where a log line goes, which sinks ship it, and how to read back what was logged for a tenant.
---

Logging follows the [module-and-driver convention](../modules-and-drivers/) like mail and storage do, with one difference: **every declared driver receives every line**. Shipping to the console and to a collector is two entries in the config, not a choice between them.

```ts
logging: {
  default: 'stdout',
  drivers: {
    stdout: { driver: 'stdout' },
    file: { driver: 'file' },
    loki: { driver: 'http' },
    store: { driver: 'database' },
  },
  retentionDays: 7,
  maxEntriesPerTenant: 10000,
},
```

A project that declares nothing gets `stdout` alone, which is what logging was before the contract existed: one JSON line per entry in production, the pretty single-line form everywhere else. `default` names the driver the query route prefers to read from when more than one can answer.

## The drivers

| Driver     | What it does                                                                      | Configured by                                                           |
| ---------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `stdout`   | The console. The default, and the only one needing nothing.                       | nothing                                                                 |
| `file`     | Appends JSON lines and rotates by size: `app.log`, `app.log.1`, `app.log.2`, ...  | `LOG_FILE_PATH`, `LOG_FILE_MAX_BYTES` (10 MB), `LOG_FILE_MAX_FILES` (5) |
| `http`     | Posts batches in Loki's push format with `fetch`; any collector speaking it works | `LOG_HTTP_URL`, `LOG_HTTP_TOKEN`, `LOG_HTTP_APP`, `LOG_HTTP_TIMEOUT_MS` |
| `database` | The persisted store: a `LogEntry` table, and the only driver `GET /logs` can read | nothing                                                                 |

Secrets and paths live in env, never in `hery.config.ts`, and are read only when the driver is declared: a project shipping to stdout is not refused at boot for lacking a collector URL.

The `http` driver labels each stream with `app` and `level` only. Every label value multiplies the streams a collector keeps, so the tenant and every other field travel inside the line, where they are searchable without costing an index.

A driver shipped as a package binds `logDriverToken('<name>')` from outside the kernel, the way `mail-resend` does for mail, and is declared with `driver: '<name>'`.

## A broken sink never breaks logging

`write` is called from inside the logger, on the path of whatever is being logged, so it never waits and never throws:

- each driver is called in its own `try`, so one that fails cannot stop a line reaching the others;
- the network and database drivers buffer and send in batches (every 100 lines or one to two seconds), hold at most 5000 lines, and drop the oldest past that;
- a batch the collector refuses, or does not answer within the timeout, is **dropped, not retried**, and reported on stderr at most once every ten seconds per driver. Retrying forever behind a collector that is down is how a log sink becomes an outage;
- before the drivers are attached at boot, and after shutdown, lines go to stdout, so a boot failure is readable even when the configured sinks are not up yet.

A declared driver that cannot be built stops the boot with the install command in the message. An app that asked for a collector and quietly got the console looks healthy until someone goes looking for the logs.

## No personal data in a line

Every line is redacted once, in the pipeline, before any driver sees it: the HTTP request logs, the application's own `Logger` calls, error messages and stack traces, job and outbox failures, Better Auth's messages, and what is shipped to a collector.

- A field whose key is a known secret or personal key (`password`, `token`, `secret`, `authorization`, `cookie`, `email`, `phoneNumber`, `address`, `firstName`…) is replaced by `[redacted]`, at any depth. So is the `name` of an object that also carries an address, a phone number or a password, and every field a resource declared `personal` in its `*.personal-data.ts`.
- Every remaining string is masked for e-mail addresses (plain or url-encoded), phone numbers, JWTs, `Bearer` tokens and `token=…`-style labelled secrets.

A name written into a free-text message cannot be recognised: log ids, not people. `pnpm run lint:conventions no-raw-pii-log` refuses a log call that hands over a `user`, a request `body` or a DTO whole; pass it through `redactForLog(...)` from `#technical/logging/log-redaction` when it really has to be logged. `LOG_LEVEL` overrides the level the environment picks.

## Every line carries its tenant

A pino mixin stamps each line with the tenant of the ambient request context, the same one the Prisma client reads. A line logged outside any request carries none and is stored against `system`, which no caller can query.

## Reading it back

```
GET /logs?level=error&from=2026-10-22T00:00:00Z&text=payment&page=1&limit=25
```

Paged, newest first, filtered by `level`, a `from` / `to` range and a case-insensitive `text` match on the message. It reads the default driver if that can answer, otherwise the first declared driver that can; only `database` can.

- **Capability:** admin only. The persisted log is everything the tenant's application said, request paths and error messages included, far more than one caller's own activity.
- **Tenant-safe:** the read is always bounded by the caller's tenant.
- **404 `log.query-unavailable`** when no declared driver keeps what it was given, instead of an empty page that reads as "nothing was logged".

## Bounded and pruned

The store is pruned hourly by the `log-prune` task, exclusive across instances: lines older than `retentionDays` (default 7) go first, then any tenant over `maxEntriesPerTenant` (default 10000) is trimmed back to that count, oldest first, so a chatty tenant cannot push a quiet tenant's recent lines out. Message text is cut at 2000 characters and a line's extra fields at 8 KB, past which a `{ "truncated": true }` marker is stored instead.

## What it does not do

- It does not retry or spool to disk when a collector is down. Dropped batches are the price of never blocking the process.
- The query route does not search the console, the file or a remote collector. Use the collector's own query tools for those.
- Request and response bodies are not logged here or anywhere; the existing redaction of `Authorization`, `Cookie` and the signal and storage query credentials is unchanged.
