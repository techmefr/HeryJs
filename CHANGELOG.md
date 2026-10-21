# Changelog

Notable changes to HeryJs. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

Because HeryJs generates code once and never re-syncs it, an entry says what
changes for a **new** project. A change to a generated file reaches an existing
project only when its developer applies it by hand, so anything in that
category is called out here explicitly.

## 0.1.0 — unreleased

First public release.

### Per-tenant quotas and usage metering

`quotas` in `hery.config.ts` declares a named limit with a default and a period (`month`, `day` or `total`), and `QuotasService` gives resources `check`, `consume` and `usage`. A tenant's limit can be overridden in the database (`PUT /quotas/:name/override`, admin only), and `GET /quotas` lists each quota's limit and use behind a capability, so the admin panel shows it as a section with no wiring. The count is kept in Postgres in one conditional `UPDATE`, so racing requests cannot overshoot, and the two new tables (`QuotaOverride`, `QuotaUsage`) are tenant scoped under row-level security. A rate-limit bucket can also be retuned for one tenant with an override named `rate-limit:<bucket>`; per plan is not covered. It is independent of `billingQuotas`, and usage-based billing is the next step. **Upgrade note:** a project that already exists needs the two new migrations, and has to add `QuotasModule` to its `AppModule` by hand.

### SMTP mail driver

A new `mail-smtp` package adds an SMTP driver beside the log and Resend ones. `hery install mail-smtp` lands it in `src/modules/mail`; import `SmtpMailModule`, declare `smtp: { driver: 'smtp' }` under `mail.drivers` in `hery.config.ts`, and set `MAIL_SMTP_HOST` and `MAIL_SMTP_FROM` (plus `MAIL_SMTP_PORT`, `MAIL_SMTP_TLS`, `MAIL_SMTP_USER` and `MAIL_SMTP_PASSWORD` as the server needs). `MAIL_DRIVER=smtp` switches to it. The driver sends through nodemailer, refuses a half-written credential and a refused recipient rather than recording the mail as sent, and its spec delivers over a real socket to an in-process SMTP server. That makes twenty-nine installable modules.

### Vector fields and similarity search

A blueprint field `type: vector` (with `dimensions` and a `source` string field) becomes a pgvector column, filled through the outbox whenever the source changes, and the search route accepts `search: { q, mode: 'similar' }`. The new `embeddings` module holds the driver contract (a deterministic `fake` driver and an `openai-compatible` one over the built-in `fetch`). Tenant, capability scope and soft-delete are part of the ranking query, which runs under the tenant's row-level security. The docker-compose and CI Postgres images are now `pgvector/pgvector:pg17` and a migration enables the extension: **upgrade note:** a project created before this must switch its Postgres image to `pgvector/pgvector:pg17` (compose and CI) before migrating, because the new migration runs `CREATE EXTENSION vector`. `hery embeddings:backfill <name>` embeds rows that existed before the field; `hery create:blueprint` can now declare a vector field. `hery generate` no longer corrupts `TENANT_SCOPED_MODELS` when the list ends with a trailing comma.

### More scaffolding, and a route table

`make:policy`, `make:seeder`, `make:driver`, `make:notification` and
`make:webhook-handler` join the existing `make:*` commands, and `hery routes`
prints every route with its capability and rate-limit bucket. A webhook source
can now have its own handler: a kernel `WebhookHandler` contract that the
webhook processor calls per event, inside the event's tenant. In a project
that already has the webhooks module, copy
`src/technical/webhooks/webhook-handler.ts` and the processor change by hand.

### Database backup and restore

`hery db:backup` writes a timestamped `pg_dump` (custom format) into `backups/` and keeps the newest `BACKUP_KEEP` (7), `hery db:backups` lists them, and `hery db:restore <file|latest>` restores one with `pg_restore`, refusing a target that already holds rows unless `--force` is passed. A `database-backup` scheduled task runs the same dump daily at 03:00 when `BACKUP_ENABLED="true"`, and uploads it through the storage driver named by `BACKUP_STORAGE_DRIVER`. It needs `pg_dump` and `pg_restore` (same major version as the server) on the machine; CI installs the 17 clients and restores a dump against a real Postgres. Point-in-time recovery is WAL archiving on your Postgres, which the new backups guide describes but does not provide. The admin panel gets a Backups page over capability-gated `/backups` routes (list, create, download, restore behind a typed confirmation, edit schedule and retention; the schedule is editable at runtime and saved next to the dumps). A new `/backups/` line in `.gitignore` keeps dumps out of the repository.

### Database workflow

`migrate:status`, `migrate:fresh`, `db:seed [--fresh]`, `db:diff` and
`db:branch create|drop|list` sit beside `migrate` and `migrate:down`. The two
that wipe a database refuse in production, and `db:branch` copies a database
with `CREATE DATABASE ... TEMPLATE`. `migrate:down` was also broken on Prisma
7, which dropped `--from-schema-datasource` and `--shadow-database-url`: it now
reads the shadow database from `SHADOW_DATABASE_URL` through `prisma.config.ts`.
An existing project adds `shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL`
to the datasource in its own `prisma.config.ts` by hand.

### OpenAPI and a typed client

`hery openapi` emits an OpenAPI 3.1 document and `hery openapi:client` a typed
TypeScript client, both read from the blueprints. What `/describe` does not
publish (the resolved-capability block, capability-dependent shapes, morph
targets, included-row types) is stated as absent, not guessed. Nothing in a
generated file changes.

### Triggers for exposed actions

`@ExposeAction` accepts `triggers`: `http: false` to leave the generic route, `cron` to run on a schedule (cluster-locked, in an explicit tenant), and `webhook` to let a signed webhook endpoint with `source: "expose:<action>"` run it. Adds a `cron` dependency. The webhooks module's service, controller, processor and module change; a project that installed it applies them by hand. Arbitrary user-defined code is not supported.

### Optimistic concurrency

A blueprint can declare `versioned: true`. The model gets an integer `version`
column that every update, soft delete and restore increments, the record view
and `/describe` expose it, and the update route refuses an entry that does not
say which version it read (`428`) or that read a stale one (`409`, or `412`
when it came in as `If-Match`). The check is part of the write itself, so two
concurrent saves at the same version cannot both succeed. Off by default:
nothing changes for a resource that does not opt in.

### Bulk mutations

Create, update, delete and restore already took an array and answered one
result per entry. They now also answer `meta: { total, succeeded, failed }`,
and accept `atomic: true`: every entry is authorised first, the writes run in
one transaction, and the first failure rolls the whole batch back and answers
`422 batch.atomicFailed` with a result for every entry. The signal and
search-index side effects of a generated service wait for the commit. A
generated service gains an `atomically` method the controller calls to open
that transaction, which only reaches an existing project if its developer
applies it by hand.

### Installing it

Twelve packages, versioned together:

- `heryjs` carries the `heryjs new` command and the module contract's types.
  A project is created with `pnpm dlx heryjs new my-app`, and the CLI travels
  into the project it writes — there is nothing global to install and nothing
  to keep in step with a release.
- `@heryjs/<name>` for each of the eleven modules, so one can be added to a
  project that was not scaffolded with it, and updated on its own.

### The CLI

- `hery new` scaffolds a standalone project: the kernel, the CLI, the default
  modules, none of this repository's own demo or documentation.
- `hery create:blueprint` and `hery generate` turn a resource description into
  real NestJS files — a module, a controller, a service, a policy, DTOs — with
  the tenant boundary and the capability checks already wired.
- `hery install`, `hery uninstall`, `hery module:list`, `hery module:new` and
  `hery module:validate` for the module system.
- `hery up`, `hery migrate`, `hery env`, `hery doctor`, `hery console`,
  `hery lint`, `hery hosts`, `hery expose` for day-to-day work.
- `hery mcp:serve` exposes the project's read tools to an MCP client.

### The kernel

- Translatable content fields: a blueprint string field with `translatable: true`
  is stored as JSON per locale, read through the request locale and the
  `i18n.fallbacks` chain, written as one string or several locales, and
  filtered, sorted and searched on the resolved value. `/describe` publishes
  the locales, and a cacheable route now varies on `Accept-Language`. A resource
  with no translatable field generates exactly what it did before.

- Authentication, API keys and sessions on better-auth.
- Session management: list devices, revoke one, sign out everywhere, a password
  change that revokes the other sessions, and per-account lockout after
  repeated failed sign-ins.
- Passwordless sign-in on better-auth, each method off until its env flag
  turns it on: magic link and email OTP delivered through the mail module,
  phone OTP through the sms module, passkeys (WebAuthn), and guest sessions
  whose work moves to the account they later sign in to. Sends are capped per recipient on top of
  the per-caller `auth` bucket. Two migrations add `phoneNumber`,
  `phoneNumberVerified` and `isAnonymous` to `User` and a `Passkey` table; an
  existing project applies them with `hery migrate`.
- Capabilities resolved server-side in memory and returned as decisions
  (`{ allowed, scope }`) — never as rules the frontend could reinterpret.
- Multi-tenancy resolved once per request and enforced underneath permissions,
  with row-level security available per model.
- Teams with the `own` / `team` / `all` / `none` presets.
- A tenant-namespaced cache on the same Valkey the kernel already depends on,
  exported globally with no module to install.
- A test-support entry point, `#devtools/test-support`: recording fakes for
  mail, sms, push, the notifier, jobs, storage, events, locks and the clock;
  `bootTestApp()`; `actingAs()` for a user, role, tenant or API key; and tenant
  isolation per suite. The generated spec now moves its outsider into another
  tenant through `actingAs` and no longer opens a `PrismaClient` of its own,
  which only changes new projects.
- `Idempotency-Key` on every mutating route: the first request's response is
  stored per tenant and replayed on a retry, the same key with a different
  body or route is a `422`, and records expire after 24 hours through the
  existing prune sweep.
- Logging behind the driver contract: `stdout` (the default, unchanged),
  size-rotated `file`, a Loki-style `http` sink over `fetch`, and a `database`
  store, every declared driver receiving every line and a failing one never
  blocking the others. Lines carry their tenant, and an admin-only `GET /logs`
  reads the store back for the caller's tenant, bounded by a retention window
  and a per-tenant cap. Adds the `LogEntry` table.
- A persisted dev dashboard, on in development only: requests, slow queries,
  N+1 findings, job history, mail / SMS / push sent and exceptions, bounded
  by a retention window and a per-tenant cap, tenant-scoped on every read,
  and shown as a page of the admin. Production needs `devDashboard.enabled`
  and then an admin capability. Adds the `DevtoolsEntry` table.
- A rate limit on by default across every kernel and module route, with
  `read` / `write` / `auth` buckets a project can retune but never remove.
- A `hasMany` include may itself carry a further `includes` — a relation of a
  relation, capped at two levels total, the same fixed-constant idiom
  `MAX_FILTER_DEPTH` already uses. `morphMany` never nests: it has no Prisma
  relation to attach a nested `include` to.
- A `hasMany` include declaring `ownRoute: true` gets its own collection
  route scoped to the parent by id — `POST /<parent>/:id/<relation>/search`
  — gated by the parent's own record-level view capability, since the
  included resource is `routed: false` and has none of its own.
- `message` on the error envelope translates per request from `Accept-Language`
  when `hery.config.ts` declares more than one locale; `key` never changes.
  `capability.forbidden` is excluded on purpose, and a `key` with no catalogue
  entry for the caller's locale falls back to its hardcoded English message.
- A transactional outbox: every create, update and delete of a tenant-scoped
  model stages a `model.created` / `model.updated` / `model.deleted` message in
  the same transaction as the write, and a relay on the `heryjs-outbox` queue
  delivers it at-least-once to the events bus (as `ModelChanged`) and to any
  registered handler, with per-handler receipts, exponential backoff, a
  dead-letter state and a daily prune. New `OutboxMessage` and `OutboxReceipt`
  tables, and `OUTBOX_RELAY_ENABLED` / `OUTBOX_RELAY_INTERVAL_MS`.
- An `encrypted` blueprint field type: AES-256-GCM at rest, decrypted
  transparently by the tenant-scoped Prisma client, hidden from responses
  unless `reveal: true`, redacted in the audit chain and refused in filters and
  sorts. Keys are versioned in `SECRETS_KEYS`; `SecretsService` seals values
  that are not columns and `hery secrets:rotate` re-encrypts to the active key.
- A realtime change feed: the outbox's model messages are published, row and
  all, to a channel per resource, filtered per subscriber by its own
  capability and tenant, with hidden fields never in the payload. The `sse`
  module serves it at `GET /sse/changes` (token from `POST /sse/changes/token`)
  and the `live` module on a Socket.IO `/changes` namespace, which also carries
  presence and capability-gated client broadcast. A generated resource now
  includes `<name>.change-feed.ts` and its module imports `ChangeFeedModule`;
  an existing project adds that file and the two lines by hand. The model
  outbox message also carries `ownerId` and `teamId` now.
- `/health` is now fed by a registry any module registers a check on, and
  `/health/live` and `/health/ready` give an orchestrator the two probes
  separately, public and carrying only ok or error. The report no longer names
  a `redis` check: it reports `cache` and `queue`.
- `hery down` puts every instance in maintenance mode, answering 503 with a
  `Retry-After` unless the request carries the bypass secret, and
  `hery up --lift` ends it. The health probes stay reachable throughout.
- An error reporter contract (`errorReporter` in `hery.config.ts`) hands every
  unexpected 500, with its `errorId`, tenant, caller and request path, to a
  Sentry-style driver. The built-in `noop` driver is the default; a domain
  exception or any other `HttpException` is never reported.
- OpenTelemetry export of traces, metrics and logs over OTLP, configured by the
  standard `OTEL_*` variables and off until `OTEL_EXPORTER_OTLP_ENDPOINT` is
  set. Spans carry the request inspector's pipeline steps, `/metrics` is
  unchanged, and every log line carries `trace_id` and `span_id`. New
  dependencies: `@opentelemetry/api`, `@opentelemetry/api-logs` and
  `@opentelemetry/sdk-node`.
- An architecture linter that fails CI on a domain missing a concern, plus
  fourteen convention checks covering capabilities, pagination, RLS, rate
  limiting, module drift and patched kernel files.

### The modules

`mail`, `storage`, `webhooks`, `live`, `stream`, `impersonation`, `graphql`,
`mcp`, `search-elasticsearch`, `search-meilisearch` and `admin-astro`, each
installable with `hery install` and removable with `hery uninstall`.

- `two-factor` (`@heryjs/two-factor`) adds TOTP enrolment that only counts once a
  first code is verified, a `TwoFactorGuard` that holds a session until it has
  passed its second factor, hashed single-use recovery codes, and a per-role
  requirement an admin sets. Its verification routes sit in the `auth`
  rate-limit bucket and lock after repeated wrong codes.
- `storage` gained `POST /storage/upload`: a driver-agnostic multipart route
  behind a session, gating on a content-type allowlist and a size cap before
  handing back a tenant-prefixed key the caller never names. A blueprint
  field can now declare `type: file` to own that key like any other column.
- `sso` adds enterprise single sign-on over OpenID Connect, configured per
  tenant: the tenant owns its identity provider (client secret sealed with
  AES-256-GCM), proves the email domains it claims with a DNS TXT record, and
  its users are provisioned just in time into that tenant. Linking an existing
  local account is a declared per-connection policy, `refuse` by default.
  A connection speaks OpenID Connect or SAML 2.0 (`protocol: 'saml'`): the
  assertion must be signed, answer the request this browser started, and name
  an address on a domain the tenant proved. SAML adds three columns to
  `SsoConnection` and makes `clientSecret` nullable; `@node-saml/node-saml`
  does the XML signature checking. The provider can be configured from its
  metadata (a URL or pasted XML) with an attribute mapping, and
  `GET /sso/connections/checks` tests every connection (certificate expiry,
  reachability, verified domain, discovery) so the admin panel, which builds
  itself from introspection, gets a section for it.

- `oauth` adds social sign-in (Google, GitHub, Microsoft) behind a provider
  contract, with PKCE, a signed single-use state cookie and verified emails
  only. What happens when a provider email already belongs to a local account
  is the declared `OAUTH_LINK_POLICY`: `refuse` by default, so nothing links
  silently.

- `notifier` honours per-user notification preferences: opt in or out per
  channel (mail, sms, push, in-app) and per notification type, quiet hours in
  the user's timezone, mail digests flushed by a scheduled job, and
  `isMandatory` notifications that no preference can suppress. Users manage
  their own rules under `/notification-preferences`. In-app is now a notifier
  channel over `AppNotification`. Installing it adds three tables, so run the
  migration it prints.

A module is its default export, closed with `satisfies ModuleDefinition` and
typed through an `import type` the compiler erases — so a published module has
no runtime dependency on HeryJs at all. Any dependency carrying
`heryjs.module: true` is discovered and installed the same way an official one
is, and the eleven official modules declare exactly what a third party's does.
