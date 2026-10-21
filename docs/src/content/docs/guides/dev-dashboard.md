---
title: Dev dashboard
description: A persisted record of requests, slow queries, N+1 findings, jobs, mail, SMS, push and exceptions, readable in the admin after a restart.
---

The [request inspector](../guides/devtools/) answers "what did the app just do", for the last 200 requests of one process. The dev dashboard answers the question that comes after: what happened ten minutes ago, which query was slow, which request ran the same statement sixty times, did the welcome mail go out, what threw.

It is on in development and off everywhere else. Nothing needs configuring to start.

## What it records

| Kind                    | One entry per                                                              | Kept                                               |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `request`               | HTTP request, including ones a guard rejected                              | method, path, status, duration                     |
| `slow-query`            | statement at or over `slowQueryMs` (default 100)                           | the parameterised statement, duration              |
| `n-plus-one`            | statement run `nPlusOneThreshold` times or more in one request (default 5) | the statement, how many times, total duration      |
| `job`                   | job a queue finished or failed                                             | queue, name, outcome, duration, failure reason     |
| `mail` / `sms` / `push` | message sent or failed                                                     | subject, outcome, masked recipient, failure reason |
| `exception`             | error the framework did not recognise (the 500s)                           | name, message, stack                               |

**Never stored:** request bodies, headers, query strings, statement parameters, job payloads, or a whole recipient. A statement is kept as Prisma ran it (`WHERE "id" = $1`), never with the values bound to it. An address is kept as `j***@example.com` and a phone number as its last two digits.

N+1 is judged per request, when it ends. Statements are compared after whitespace, placeholder numbers and the length of an `IN (...)` list are normalised away, which is exactly what a loop over ids produces. The same statement run five times across five requests is not a finding.

## Reading it

```
GET    /devtools/entries?kind=slow-query&minDurationMs=200&page=1&limit=25
GET    /devtools/summary
DELETE /devtools/entries
```

`entries` is paged, newest first, and filters by `kind` and `minDurationMs`; an unknown kind is a 400. `summary` is one count per kind. `DELETE` clears the caller's tenant and nobody else's. The admin shows all of it on the **Dev dashboard** page.

Reading the dashboard does not write to it: the dashboard's own routes are excluded, or every refresh would be the newest thing on the page.

## Configuration

Everything is optional, in `hery.config.ts`:

```ts
devDashboard: {
  enabled: true,
  retentionHours: 24,
  maxEntriesPerTenant: 5000,
  slowQueryMs: 100,
  nPlusOneThreshold: 5,
},
```

`enabled` defaults to on when `NODE_ENV` is neither `production` nor `test`. Setting it explicitly wins in both directions: `true` is the opt-in for a deployed environment, `false` silences it locally.

## In production

Off means off: nothing records and `/devtools/*` answers 404. With `enabled: true`, recording starts and the routes stay behind `SessionGuard` plus the `canUseDevDashboard` capability, which in production is the admin ability rather than "any signed-in caller". Outside production every signed-in developer can read it, like the rest of the devtools.

Turning it on in production stores a tenant's request paths, parameterised statements, error messages and masked recipients in your database. That is a decision about your data, so it is a line in the config file and not a default.

## Tenant safety

Every entry carries the tenant it was recorded under, and every read and every clear is bounded by the caller's. A job or a message with no tenant is recorded against `system`, which no caller can read. Request entries from an unauthenticated caller carry the `unauthenticated` tenant the tenant middleware assigns, and are equally unreadable.

## Bounded and prunable

A scheduled task (`devtools-prune`, every ten minutes, exclusive across instances) deletes entries older than `retentionHours`, then trims any tenant over `maxEntriesPerTenant` back to that count, oldest first. A noisy tenant therefore cannot push a quiet tenant's recent entries out, which a single global cap would.

Recording never sits on a request's critical path. A listener appends to a bounded in-memory buffer and a timer writes it out in batches; if a write fails, that batch is dropped and a warning is logged. A request never waits on, or fails because of, its own telemetry.

## How it is fed

The kernel may not import `devtools/`, so it reports through `TelemetryBus` in `src/technical/tracing/`. The Prisma client, the exception filter and the mail, SMS and push modules emit onto it; the dashboard subscribes from the other side. With no subscriber, which is every production process that has not opted in, an emit returns after a single check.

Jobs need no cooperation from any processor: the dashboard listens to the queues themselves, so a worker on another instance is recorded the same way as one in this process. A job's payload is read for its `tenantId` and for nothing else.

Persisting an entry runs its own queries, and without care each of them would be heard, persisted and heard again. Everything the dashboard's store does runs muted, and the recorder also ignores any statement touching its own table.

## What it does not do

- It is not tracing. There is no span tree or sampling, and the [pipeline page](../guides/devtools/) remains the per-request step view.
- It does not record statements made through better-auth's own client, which does not go through the instrumented one.
- Requests handled by an instance that is not recording are absent; the table is shared, but each instance decides for itself whether to write to it.
