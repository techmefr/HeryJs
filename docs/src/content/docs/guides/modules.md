---
title: The module system
description: hery install — the optional layer, à la carte or as a full package, and why it never edits your app module.
---

The kernel in `technical/` is what every project gets. Everything beyond it — search engines, GraphQL, WebSockets, mail, storage, webhooks, an admin panel — arrives through `hery install` and lands in `src/modules/`, where it can be removed again.

A module is an installer, not a dependency. It runs once, writes real files into your project, and disappears. There is no module resident at runtime, no plugin lifecycle, no hook system: the same "generate once, own your code" bargain as `hery generate`, applied to infrastructure instead of resources.

The files it writes are held to the same conventions as the kernel, because they were written by the same people: a guard and a policy on every route, tenant scoping, and a paged collection route wherever it exposes one — `lint:pagination` and `lint:capabilities` cover module code exactly as they cover `technical/`. Installing a module is meant to be the whole job: fill in whatever it added to `.env`, run the migration it printed, and it works. Nothing is left as an exercise.

## Listing and installing

```bash
pnpm hery module:list                      # what is available
pnpm hery install storage                  # one
pnpm hery install storage mail graphql     # several
pnpm hery install --all                    # the full package
```

`install` takes a variadic list of module ids. `--all` installs every registered module in registry order — note that it _ignores_ any names given alongside it, and that it will install both search drivers, which is rarely what you want.

Running `pnpm hery install` with no arguments prints `nothing to install` and exits 0. An unknown id reports itself and sets a failing exit code, but the other names in the same invocation are still installed.

## What is available

| Id                     | What it adds                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `search-elasticsearch` | Swaps free-text search onto Elasticsearch — docker service, driver, DI wiring.                           |
| `search-meilisearch`   | The same, onto Meilisearch.                                                                              |
| `graphql`              | A GraphQL endpoint (Apollo driver) with a session guard mirroring the REST auth flow.                    |
| `mcp`                  | An authenticated MCP gateway over Streamable HTTP, exposing resources as tools.                          |
| `live`                 | Bidirectional WebSocket support (Socket.IO).                                                             |
| `stream`               | One-to-many audio/video over LiveKit.                                                                    |
| `mail`                 | Outgoing mail: a `MailLog` model, string templates, and a BullMQ job that sends.                         |
| `storage`              | File storage behind a swappable provider — local disk by default, S3-compatible via `STORAGE_DRIVER=s3`. |
| `admin-astro`          | An admin panel built with Astro, discovering its sections from `GET /introspect`.                          |
| `impersonation`        | Let an admin act as another user, tenant-bounded and audit-logged, via a bearer token for the target.     |
| `webhooks`             | Receive inbound webhooks with HMAC-SHA256 signature verification and run each one through Event, Job, Notification, Audit and Signal. |

Six of them have a runtime half in `src/modules/`: `live`, `stream`, `mail`, `storage`, `impersonation`, `webhooks`. The search drivers install into the existing `technical/search/` folder, because they implement a contract the kernel already owns.

`hery module:monitoring` looks like a module but is a separate command: it scaffolds Prometheus, Grafana and Loki as a local compose stack. It is not in the registry, so it does not appear in `module:list` and `--all` does not cover it.

## Two channels, discovered rather than hardcoded

Every module above is **official** — it lives in this repository's own `packages/` directory. `module:list` labels each entry with its channel:

```
admin-astro [official] - Add an admin panel built with Astro...
```

Discovery walks `packages/*` at startup and requires whatever `src/module.ts` it finds there — there is no barrel file listing packages by hand, so a new official module needs nothing beyond its own folder to show up.

Because this repository has every module installed into itself, each one exists twice: authored under `packages/<name>/src/runtime`, installed where that module's own `module.ts` copies it to. `pnpm lint:module-drift` compares the two and fails when they diverge — a fix applied to the copy that runs here and not to the copy a project would install is a fix nobody else gets, and the whole gate stayed green through it until this check existed. The runtime file is written against the kernel through a `#kernel/` specifier, rewritten to the app's own `#technical/` on the way in, which is the only difference between the two copies.

The **community** channel is the same mechanism turned outward: any npm package a project installs can register itself as a module by adding a `heryjs.module: true` marker to its own `package.json`. `hery module:list` and `hery install` scan the project's declared dependencies for that marker and require whichever ones carry it — there is no separate registry to submit to and nothing HeryJs curates on that side; the convention itself is the whole channel.

## A module is these fields

```ts
export type ModuleChannel = 'official' | 'community';

export interface ModuleDefinition {
  name: string; // the id you type
  description: string; // the line module:list prints
  channel: ModuleChannel;
  dependencies?: string[];
  install(): void | Promise<void>;
  uninstall?(): void | Promise<void>;
}
```

`dependencies` are npm specifiers handed to `pnpm add -w` before `install()` runs. `install()` does all the writing and prints its own next steps. `uninstall()` is optional and rarely needed — see below for why removing a module stops short of being fully automatic.

## Installing is idempotent, per file

Every module guards each file it writes:

```
src/modules/storage/storage.module.ts already exists, skipping.
```

Nothing is overwritten and nothing is re-templated, so a file you have edited by hand survives a re-install untouched. There is no `--force` on `install`, unlike `generate`.

The modules that patch an existing file guard on content rather than existence: `mail` skips if `prisma/schema.prisma` already contains `model MailLog`, `webhooks` skips the same file if it already has `model WebhookEndpoint`, `admin-astro` skips if `pnpm-workspace.yaml` already lists `admin`, and `impersonation` skips each of its four kernel-file patches independently, once its own marker is already there.

Be aware of what this does _not_ give you. There is no record anywhere of which modules are installed — no manifest, no marker in `package.json`. "Installed" is inferred one file at a time, at write time.

## `hery uninstall` removes what is safe to automate, and nothing else

```bash
pnpm hery uninstall storage
```

`install()` copies runtime files and patches a handful of kernel files, both of which become code the project owns from that point on — possibly edited since. Reversing either automatically would mean guessing whether what is on disk still matches what was generated, the same silent-rewrite risk "own your code" rules out everywhere else. So `uninstall` only automates the one part that is unambiguous: removing the module's own npm dependencies. Everything else — the import in `src/app.module.ts`, the copied or patched files, a Prisma migration to drop whatever it added — comes back as an explicit numbered list, the same shape `install()` itself prints for its next steps. The layering rules are what make finishing that list a bounded job rather than an archaeology exercise.

One consequence of the unconditional dependency step: `pnpm add -w` runs on every install of a module that declares dependencies, even when every file is then skipped.

## `install` never edits your app module

This is deliberate and consistent across all eleven. Every module that needs wiring ends its output with a numbered list telling you what to add, and where:

```
Next steps:
  1. Import StorageModule into src/app.module.ts
  2. Inject STORAGE_PROVIDER anywhere and call .put()/.signedUrl()/.remove()
```

`src/app.module.ts` is the single composition point between the kernel and the optional layer, and it is yours. A tool that rewrote it would be a tool you could no longer freely edit — and the whole premise here is that you can.

Two modules wire into a _resource_ module rather than the app module, because they are per-resource by nature: `live` (a gateway) and `stream` (a controller) both go into `src/functional/<name>/<name>.module.ts`.

## Schema and environment

`mail`, `webhooks` and `impersonation` are the three that touch `prisma/schema.prisma` — `mail` and `webhooks` each append their own new models (`MailLog`, and `WebhookEndpoint`/`WebhookEvent`), `impersonation` adds fields to the existing `User` and `Session` models instead, since it needs columns on a model it does not own. All three leave you one migration behind, which is why their next steps start with `pnpm hery migrate --name add_mail_log`, `add_webhooks` or `add_impersonation`. `hery install` never runs Prisma itself.

**No module writes to `.env`.** Every variable a module needs has a working development default, so a fresh install runs with no configuration at all. It is still validated: a module is opt-in, so `technical/config/env.ts` cannot declare variables for a module that may not be installed, and each module declares a schema of its own instead — `storage.env.ts`, `stream.env.ts`, one per module that has configuration — parsed through `technical/config/module-env.ts` when the module is imported. A misspelled `STORAGE_DRIVR` is refused at boot with the module's name on it, rather than silently becoming `local`.

The one command that does write env vars is `pnpm hery up --start`: for each search module whose compose file is present, it starts the service and resolves the Docker-assigned port into `.env` as `ELASTICSEARCH_URL` or `MEILISEARCH_URL`. So installing a search module and running `hery up --start` are two halves of the same step.

The compose files for `stream`, `storage` and `monitoring` are not covered by `hery up` — start those by hand:

```bash
docker compose -f docker-compose.storage.yml up -d
```

## Module configuration at a glance

Every variable below has a working development default, and none of them are written to `.env` by the installer.

| Module                           | Variables                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search-elasticsearch`           | `ELASTICSEARCH_URL`                                                                                                                                       |
| `search-meilisearch`             | `MEILISEARCH_URL`, `MEILISEARCH_API_KEY`                                                                                                                  |
| `stream`                         | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`                                                                                                    |
| `storage`                        | `STORAGE_URL_SECRET`, `STORAGE_DRIVER`, `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_ACCESS_KEY`, `STORAGE_S3_SECRET_KEY` |
| `admin-astro`                    | `PUBLIC_API_URL`                                                                                                                                          |
| `webhooks`                       | `WEBHOOK_SIGNATURE_TOLERANCE_SECONDS`                                                                                                                     |
| `graphql`, `mcp`, `live`, `mail`, `impersonation` | none                                                                                                                                    |

The development defaults are development defaults in the literal sense — the LiveKit dev keys are `devkey`/`secret` and the MinIO credentials are `heryjs`/`heryjs-dev-secret`. You do not have to remember to replace them: under `NODE_ENV=production` every one of those defaults is refused at boot, naming the variable that is still set to it, because a credential printed in a public repository is not a credential and a URL pointing at localhost is not a service. The S3 credentials are checked when the S3 provider is constructed rather than when the module is imported, so a production app on the local driver is never refused a boot over credentials it does not use.

The two secrets the framework itself signs with, `SIGNAL_TOKEN_SECRET` and `STORAGE_URL_SECRET`, answer to the same contract from the kernel's own schema. They are separate on purpose — the local storage driver signs its URLs the same way the signal SSE token is signed, and one shared value would mean a leak on either side forges both.
