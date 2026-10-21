---
title: Maintenance mode
description: "One command stops every instance taking traffic while a migration runs, and tells clients when to come back."
---

A migration that locks a table, a restore, a cutover: sometimes the honest
answer to a request is "not right now". Without a switch, that answer is
whatever the half-migrated application happens to produce.

```sh
pnpm hery down --secret --retry 300 --message "Back at 14:00 UTC."
# maintenance mode is on
# bypass with the header x-hery-maintenance-secret: 67250b97d7c7...

pnpm hery up --lift
```

## What a client sees

Every request answers `503 Service Unavailable` with a `Retry-After` header
(`--retry`, 60 seconds by default). An API client gets the usual error envelope
with the key `maintenance.active`; a browser (`Accept: text/html`) gets the
error page.

```json
{
  "error": {
    "status": 503,
    "key": "maintenance.active",
    "message": "Back at 14:00 UTC.",
    "details": { "retryAfterSeconds": 300 }
  }
}
```

## The bypass secret

`--secret` lets you keep using the application while everyone else is refused,
which is how a migration gets verified before traffic returns. Pass a value, or
no value to have one generated and printed once. Requests carrying it in the
`X-Hery-Maintenance-Secret` header go through:

```sh
curl -H "X-Hery-Maintenance-Secret: 67250b97d7c7..." localhost:3000/users
```

Only a hash of the secret is stored, so reading Redis does not reveal it, and
the comparison is constant-time. Without `--secret`, nobody bypasses.

## What stays reachable

`/health`, `/health/live` and `/health/ready` keep answering. An orchestrator
that saw 503 on its probe would kill the instance that is refusing traffic on
purpose, and replace it with one that refuses it too.

## How it spreads

The switch is one key in the Redis every instance already shares, so `hery down`
from anywhere reaches all of them. Each instance re-reads it at most once a
second, which is the time between the command and the last instance answering
503. If Redis cannot be read, the application keeps serving rather than
refusing everything on the strength of a failure to ask.

Maintenance mode refuses HTTP requests only. Scheduled tasks and queue workers
keep running; pause them yourself if the work you are protecting is theirs.
