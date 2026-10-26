---
title: Deploying to production
description: The Dockerfile a new project ships with, the migration job, the environment contract, and the probes an orchestrator points at.
---

`hery new` writes a `Dockerfile` and a `.dockerignore`. There is no `hery deploy`
command: an image and an environment are what every platform (Kubernetes, Fly,
Render, a plain VM) already asks for, and a command wrapping them would only
choose a platform for you.

## The image

One Dockerfile, two targets built from the same source:

```bash
docker build --target migrate -t my-app-migrate .
docker build -t my-app .
```

- `runtime` (the default) is multi-stage, runs as the non-root `node` user, installs with `pnpm install --frozen-lockfile`, generates the Prisma client and runs `nest build`. It starts `node dist/src/main` and declares a `HEALTHCHECK` on `/health/live`.
- `migrate` is a one-shot job that runs `prisma migrate deploy` and exits.

The runtime image carries the production dependencies only. `nest build`
compiles `hery.config.ts` and `cors.config.ts` to `dist/hery.config.js` and
`dist/cors.config.js`, which is what the process reads under
`NODE_ENV=production`: neither `ts-node` nor `typescript` is needed at boot.

The build needs a `pnpm-lock.yaml` and `prisma/migrations/`, both committed:
run `pnpm install` and `pnpm hery migrate --name init` once, locally, and commit
what they write.

## Migrations are a separate step

Run the `migrate` target once per release, **before** the new `runtime`
containers take traffic:

```bash
docker run --rm -e DATABASE_URL=... my-app-migrate
```

It is not run on container start, because with several replicas they would all
race to migrate the same database, and because a failed migration should stop
the rollout rather than crash-loop a pod. `migrate deploy` applies only
committed migrations and never creates one, so migrations (including the
row-level-security ones `hery migrate` emits) are written in development and
shipped in the image.

## Environment contract

With `NODE_ENV=production` (set by the image) the process refuses to boot until
every variable below is set to a real value. A development default is rejected
by name, so a missing one fails at startup with the variable named rather than
degrading silently.

| Variable                                                                              | What it is                                                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                        | Postgres connection string (pgvector image, see the vector guide)                                                                  |
| `REDIS_URL`                                                                           | Redis, for cache, queues, locks and realtime                                                                                       |
| `BETTER_AUTH_URL`                                                                     | The public URL of the API, used in auth links                                                                                      |
| `BETTER_AUTH_SECRET`                                                                  | Better Auth's signing secret, `openssl rand -base64 32`                                                                            |
| `SIGNAL_TOKEN_SECRET`, `SSE_TOKEN_SECRET`, `OAUTH_STATE_SECRET`, `STORAGE_URL_SECRET` | Four independent secrets, so a leak of one forges none of the others                                                               |
| `SECRETS_KEYS`                                                                        | `<id>:<base64 key>` list for column encryption, `pnpm hery secrets:key`                                                            |
| `SSO_STATE_SECRET`, `SSO_SECRET_KEY`                                                  | The sso module's state secret and 32-byte key                                                                                      |
| `SSO_REDIRECT_BASE_URL`, `OAUTH_REDIRECT_BASE_URL`                                    | The public URL the sso and oauth callbacks are built on                                                                            |
| `STORAGE_S3_ACCESS_KEY`, `STORAGE_S3_SECRET_KEY`                                      | Required even on the local storage driver while the storage module is installed: the boot check does not know which driver you use |

Optional and defaulted: `PORT` (3000), `SECRETS_ACTIVE_KEY_ID`,
`DATABASE_MIGRATION_URL`, `OUTBOX_RELAY_ENABLED`, `OTEL_*`, and the `AUTH_*` and `OAUTH_*`
families, all listed in `.env.example`. A module you install adds its own: the
two-factor module wants `TWO_FACTOR_ENCRYPTION_KEY`, the stream module its
LiveKit credentials, and the S3 storage driver its bucket and keys. Inject them
from your platform's secret store, never into the image.

## Before the first deploy

A new project's `cors.config.ts` allows any origin, and production refuses that
value at boot. List the origins that call the API, or empty the list to send no
CORS header at all, before building the image.

## Probes

| Route               | Use it for                                        |
| ------------------- | ------------------------------------------------- |
| `GET /health/live`  | the liveness probe, and the image's `HEALTHCHECK` |
| `GET /health/ready` | the readiness probe: database, cache and queue    |

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
```

See [Health checks](../health/) for what each one answers.

## From the admin panel

`GET /deployment` answers, for a caller allowed `canReadDeployment` (an admin),
the project's version, `NODE_ENV`, each variable of the contract above as set
or not set (never its value), the readiness report, and the count of applied
migrations. It is an argument-free `GET`, so the [admin panel](../admin/)
lists it without being told about it.

The admin builds itself from `GET /introspect`, which is behind
`DevOnlyGuard`: in production that route is refused, so a production admin
needs a different source for its sections. Until that is settled, call
`/deployment` directly with a session.
